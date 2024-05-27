/*
Copyright (c) 2024 Jakub Augustýn
SPDX-License-Identifier: MIT
 */
const __author__ = "kubik.augustyn@post.cz"

class OpenVideoPlayerUtils {
    /**
     * Checks whether a point is inside a bounding box
     * @param bbox {DOMRect}
     * @param pointX {number}
     * @param pointY {number}
     * @returns {boolean}
     */
    static isPointWithinBBox(bbox, pointX, pointY) {
        return bbox.left <= pointX && bbox.top <= pointY && bbox.right > pointX && bbox.bottom > pointY
    }

    /**
     * Adds the event listener to many event names
     * @param element {EventTarget}
     * @param listenerNames {string[]}
     * @param listener {function}
     */
    static addEventListeners(element, listenerNames, listener) {
        listenerNames.forEach(name => element.addEventListener(name, listener))
    }

    /**
     * Clamps a number
     * @param x {number}
     * @param leftBoundary {number}
     * @param rightBoundary {number}
     * @returns {number}
     */
    static clamp(x, leftBoundary, rightBoundary) {
        return Math.max(leftBoundary, Math.min(x, rightBoundary))
    }

    /**
     * @type {Map<HTMLElement, ResizeObserver>}
     */
    static #CSSSizeObservers = new Map()

    /**
     * Adds a resize listener to change CSS variables --elem-width and --elem-height for the element
     * @param element {HTMLElement}
     */
    static setCSSSize(element) {
        const resizeObserver = new ResizeObserver(entries => {
            this.#setCSSSizeHandler(element)
        })
        resizeObserver.observe(element)
        this.#CSSSizeObservers.set(element, resizeObserver)

        // Fire it for the first time just to make sure
        this.#setCSSSizeHandler(element)
    }

    /**
     * @param element {HTMLElement}
     */
    static #setCSSSizeHandler(element) {
        const bbox = element.getBoundingClientRect() // I guess it cannot be cached/memoized
        element.style.setProperty("--elem-width", String(bbox.width).concat("px"))
        element.style.setProperty("--elem-height", String(bbox.height).concat("px"))
    }

    static {
        document.addEventListener("DOMContentLoaded", () => {
            for (let element of this.#CSSSizeObservers.keys()) {
                this.#setCSSSizeHandler(element)
            }
        })
    }

    static CachedBBox = class OpenVideoPlayerUtilsCachedBBox {
        /**
         * @type {HTMLElement}
         */
        #element
        /**
         * @type {DOMRect|null}
         */
        #bbox

        /**
         * @param element {HTMLElement} The target element
         */
        constructor(element) {
            this.#element = element
            this.#bbox = null

            const resizeObserver = new ResizeObserver(entries => {
                this.#reFetchBBox()
            })
            resizeObserver.observe(this.#element)
        }

        /**
         * Re-gets the BBox of the element
         * @returns {DOMRect}
         */
        #reFetchBBox() {
            return this.#bbox = this.#element.getBoundingClientRect()
        }

        /**
         * Gets the element's bbox, caching it
         * @returns {DOMRect}
         */
        get value() {
            if (this.#bbox) return this.#bbox
            return this.#reFetchBBox()
        }
    }
}

class OpenVideoPlayerStyle {
    static #THEMES = new Set(["light", "dark"])

    /**
     * @type {OpenVideoPlayer}
     */
    #player

    constructor(player) {
        this.#player = player

        // Default styles
        this.fill()
        this.theme(OpenVideoPlayerStyle.#THEMES.values().next().value)
    }

    fill() {
        this.#player.container.classList.add("fill")
    }

    size(width, height) {
        this.#player.container.classList.remove("fill")
        this.#player.container.style.width = typeof width === "number" ? `${width}px` : width
        this.#player.container.style.height = typeof height === "number" ? `${height}px` : height
    }

    theme(themeName) {
        if (!OpenVideoPlayerStyle.#THEMES.has(themeName)) throw new Error(`Unknown theme "${themeName}"`)
        for (const name of OpenVideoPlayerStyle.#THEMES.values()) {
            this.#player.container.classList.toggle(`theme-${name}`, name === themeName)
        }
    }
}

class OpenVideoPlayerSlider extends EventTarget {
    /**
     * The entire slider's container
     * @type {HTMLDivElement}
     */
    #container
    /**
     * @type {OpenVideoPlayerUtils.OpenVideoPlayerUtilsCachedBBox}
     */
    #containerBBox
    /**
     * The slider's circle
     * @type {HTMLDivElement}
     */
    #sliderPointer
    /**
     * The current slider progress element
     * @type {HTMLDivElement}
     */
    #sliderProgress
    /**
     * The slider element that is behind everything
     * @type {HTMLDivElement}
     */
    #sliderBackground
    /**
     * Cursor progress if the cursor isn't being pressed -> input elem isn't changing
     * @type {HTMLDivElement}
     */
    #ghostSlider
    /**
     * Ghost slider's current state (same format as rawValue)
     * @type {number|null}
     */
    #ghostSliderValue
    /**
     * @type {HTMLDivElement}
     */
    #sliderPadding
    /**
     * @type {{min: number, max: number, step: number}}
     */
    #range
    /**
     * @type {number}
     */
    #rawValue
    /**
     * @type {{value: number, ghostValue: number}|null}
     */
    #lastChange

    /**
     * @param container {HTMLDivElement}
     * @param colorOverride {{beforeValue: string|undefined, afterValue: string|undefined, ghostValue: string|undefined}|undefined}
     */
    constructor(container, colorOverride = undefined) {
        super()
        this.#container = container
        this.#rawValue = 0
        this.#ghostSliderValue = null
        this.#lastChange = null
        colorOverride?.beforeValue && container.style.setProperty("--slider-before-value-color", colorOverride.beforeValue)
        colorOverride?.afterValue && container.style.setProperty("--slider-after-value-color", colorOverride.afterValue)
        colorOverride?.ghostValue && container.style.setProperty("--slider-ghost-value-color", colorOverride.ghostValue)
        this.#createElements()
        this.range(0, 100, 1) // Default range
    }

    #createElements() {
        const cont = this.#container
        cont.classList.add("slider")
        const contBBox = this.#containerBBox = new OpenVideoPlayerUtils.CachedBBox(cont)

        const sliderPadding = this.#sliderPadding = document.createElement("div")
        sliderPadding.classList.add("slider-padding")
        const sliderPaddingBBox = new OpenVideoPlayerUtils.CachedBBox(sliderPadding)
        const resizeObserver = new ResizeObserver(entries => {
            this.#onResize()
        })
        resizeObserver.observe(sliderPadding)

        const sliderPointer = this.#sliderPointer = document.createElement("div")
        sliderPointer.classList.add("slider-pointer")
        const onDrag = e => {
            e.preventDefault()
            cont.classList.add("sliding")
        }
        const onMove = e => {
            if (!cont.classList.contains("sliding")) return
            movePointer(e)
        }
        const onDragEnd = e => {
            cont.classList.remove("sliding")
        }
        const onClick = e => {
            movePointer(e)
        }
        const movePointer = e => {
            const clientX = ("touchmove" === e.type ? e.touches[0].clientX : e.clientX)
            const bbox = contBBox.value
            const progress = clientX - bbox.left
            this.#rawValue = OpenVideoPlayerUtils.clamp(progress / bbox.width, 0, 1)
            this.#ghostSliderValue = null
            this.#onChange()
        }
        OpenVideoPlayerUtils.addEventListeners(sliderPointer, ["mousedown", "touchstart"], onDrag)
        OpenVideoPlayerUtils.addEventListeners(document, ["mouseup", "touchend", "touchcancel"], onDragEnd)
        OpenVideoPlayerUtils.addEventListeners(document, ["mousemove", "touchmove"], onMove)
        OpenVideoPlayerUtils.addEventListeners(sliderPadding, ["click"], onClick)

        const sliderProgress = this.#sliderProgress = document.createElement("div")
        sliderProgress.classList.add("slider-progress")
        sliderProgress.style.width = "0px" // Initial value, before the slider is added to the DOM

        const sliderBackground = this.#sliderBackground = document.createElement("div")
        sliderBackground.classList.add("slider-background")

        const ghostSlider = this.#ghostSlider = document.createElement("div")
        ghostSlider.classList.add("ghost-slider")
        const changeGhostSlider = e => {
            if (OpenVideoPlayerUtils.isPointWithinBBox(sliderPaddingBBox.value, e.clientX, e.clientY)) {
                const bbox = contBBox.value
                const progress = e.clientX - bbox.left
                this.#ghostSliderValue = OpenVideoPlayerUtils.clamp(progress / bbox.width, 0, 1)
            } else this.#ghostSliderValue = null
            this.#onChange()
        }
        OpenVideoPlayerUtils.addEventListeners(sliderPadding, ["mousemove", "mouseenter", "mouseleave", "mouseover"], changeGhostSlider)

        // Finalize
        cont.appendChild(sliderPadding) // Padding first for CSS :hover
        cont.appendChild(sliderBackground)
        cont.appendChild(ghostSlider)
        cont.appendChild(sliderProgress)
        cont.appendChild(sliderPointer)
    }

    #onResize() {
        this.#resizeElements()

        const slider = this
        this.dispatchEvent(new class OpenVideoPlayerSliderResize extends Event {
            target = slider

            constructor() {
                super("resize");
            }
        })
    }

    #resizeElements() {
        const bbox = this.#containerBBox.value
        // Clamp it just to make sure
        const valueSize = OpenVideoPlayerUtils.clamp(this.#rawValue * bbox.width, 0, bbox.width)
        this.#sliderProgress.style.width = String(valueSize).concat("px")
        this.#sliderPointer.style.left = String(valueSize).concat("px")
        if (this.#ghostSliderValue === null) {
            this.#ghostSlider.style.removeProperty("width")
            this.#ghostSlider.style.display = "none"
        } else {
            const ghostOffset = OpenVideoPlayerUtils.clamp(this.#ghostSliderValue * bbox.width, 0, bbox.width)
            this.#ghostSlider.style.width = String(ghostOffset).concat("px")
            this.#ghostSlider.style.removeProperty("display")
        }

        // TODO Use scaling and translations (make it compatible with CSS)
        // this.#sliderProgress.style.transform = `scaleX(${this.#rawValue}`
        // this.#sliderPointer.style.transform = `translateX(${this.#rawValue}`
        // this.#ghostSlider.style.transform = `scaleX(${this.#ghostSliderValue}`
    }

    #onChange() {
        this.#resizeElements()

        const slider = this
        const val = this.value
        const ghostVal = this.ghostValue

        if (this.#lastChange !== null) {
            if (this.#lastChange.value === val && this.#lastChange.ghostValue === ghostVal) return
        }
        const valueHasChanged = this.#lastChange === null || this.#lastChange.value !== val
        const ghostValueHasChanged = this.#lastChange === null || this.#lastChange.ghostValue !== ghostVal
        this.#lastChange = {value: val, ghostValue: ghostVal}

        this.dispatchEvent(new class OpenVideoPlayerSliderChanged extends Event {
            value = val
            ghostValue = ghostVal
            valueHasChanged = valueHasChanged
            ghostValueHasChanged = ghostValueHasChanged
            target = slider

            constructor() {
                super("change");
            }
        })
    }

    /**
     * Whether the slider is currently being dragged/slid
     * @returns {boolean}
     */
    get sliding() {
        return this.#container.classList.contains("sliding")
    }

    /**
     * Sets the current slider's range, including both min and max and moving by the step provided
     * @param min
     * @param max
     * @param step
     */
    range(min, max, step) {
        this.#range = {min, max, step}

        const slider = this
        const range = this.getRange()
        this.dispatchEvent(new class OpenVideoPlayerSliderRange extends Event {
            value = range
            target = slider

            constructor() {
                super("range");
            }
        })
        this.#onChange() // When the range changes, the value obviously does so
    }

    /**
     * @returns {{min: number, max: number, step: number}}
     */
    getRange() {
        return {...this.#range} // No access to private fields!
    }

    get rawValue() {
        return this.#rawValue
    }

    get value() {
        return this.#adjustValue(this.#range.min + this.#rawValue * (this.#range.max - this.#range.min))
    }

    get ghostValue() {
        if (this.#ghostSliderValue === null) return null // If the ghost slider isn't in use
        return this.#adjustValue(this.#range.min + this.#ghostSliderValue * (this.#range.max - this.#range.min))
    }


    set rawValue(newRawValue) {
        this.#rawValue = OpenVideoPlayerUtils.clamp(newRawValue, 0, 1)
        this.#onChange()
    }

    set value(newValue) {
        // Adjust the value
        newValue = this.#adjustValue(newValue)
        // The raw value serves to not move the slider out of bounds when the range changes
        this.#rawValue = (newValue - this.#range.min) / (this.#range.max - this.#range.min)
        this.#onChange()
    }

    #adjustValue(value) {
        const multiplier = 1 / this.#range.step
        value = Math.round(value * multiplier) / multiplier
        value = OpenVideoPlayerUtils.clamp(value, this.#range.min, this.#range.max)
        return value
    }
}

class OpenVideoPlayerControlsButton extends EventTarget {
    static SVG_VIEW_BOX = "0 0 36 36"
    static SVG_NS = 'http://www.w3.org/2000/svg'
    /**
     * The control button registered icons
     * @type {Map<string, string[][]>}
     */
    static ICONS = new Map()

    /**
     * @type {HTMLButtonElement}
     */
    #element
    /**
     * @type {SVGSVGElement}
     */
    #svg
    /**
     * @type {SVGPathElement[]}
     */
    #svgPaths
    /**
     * @type {string}
     */
    #currentIconName
    /**
     * @type {number}
     */
    #currentIconIndex

    constructor(name) {
        super()

        this.#currentIconName = name
        this.#currentIconIndex = 0
        this.#initElements()
    }

    #initElements() {
        const root = this.#element = document.createElement("button")
        root.classList.add("controls-button")
        root.addEventListener("click", this.#onClick.bind(this))

        // https://stackoverflow.com/questions/54768105/shortened-slug
        const svg = this.#svg = document.createElementNS(OpenVideoPlayerControlsButton.SVG_NS, "svg")
        svg.classList.add("icon")
        svg.setAttribute("viewBox", OpenVideoPlayerControlsButton.SVG_VIEW_BOX)
        svg.setAttribute("xmlns", OpenVideoPlayerControlsButton.SVG_NS)

        this.#svgPaths = []
        this.#changePaths()

        root.appendChild(svg)
    }

    #changePaths() {
        if (!OpenVideoPlayerControlsButton.ICONS.has(this.#currentIconName)) throw new Error(`No icon called "${this.#currentIconName}" found`)
        /**
         * @type {string[]}
         */
        const newDs = OpenVideoPlayerControlsButton.ICONS.get(this.#currentIconName)[this.#currentIconIndex]
        if (!newDs) throw Error("No ds found for the provided icon name and sub-index")
        // Make the path count equal
        while (newDs.length > this.#svgPaths.length) {
            const path = document.createElementNS(OpenVideoPlayerControlsButton.SVG_NS, "path")
            this.#svgPaths.push(path)
            this.#svg.appendChild(path)
        }
        while (newDs.length < this.#svgPaths.length) {
            const path = this.#svgPaths.pop()
            this.#svg.removeChild(path)
        }

        // Change the ds
        newDs.forEach((newD, i) => this.#svgPaths[i].setAttribute("d", newD))
    }

    #onClick() {
        const self = this

        this.dispatchEvent(new class OpenVideoPlayerControlsButtonClicked extends MouseEvent {
            target = self

            constructor() {
                super("click");
            }
        })
    }

    /**
     * @returns {HTMLButtonElement}
     */
    get element() {
        return this.#element
    }

    /**
     * @returns {string}
     */
    get name() {
        return this.#currentIconName
    }

    /**
     * @param newName {string}
     */
    set name(newName) {
        this.#currentIconName = newName
        this.#currentIconIndex = 0
        this.#changePaths()
    }

    /**
     * @returns {number}
     */
    get index() {
        return this.#currentIconIndex
    }

    /**
     * @param newIndex {number}
     */
    set index(newIndex) {
        this.#currentIconIndex = newIndex
        this.#changePaths()
    }

    static {
        OpenVideoPlayerControlsButton.ICONS.set("volume", [
            ["m 21.48,17.98 c 0,-1.77 -1.02,-3.29 -2.5,-4.03 v 2.21 l 2.45,2.45 c .03,-0.2 .05,-0.41 .05,-0.63 z m 2.5,0 c 0,.94 -0.2,1.82 -0.54,2.64 l 1.51,1.51 c .66,-1.24 1.03,-2.65 1.03,-4.15 0,-4.28 -2.99,-7.86 -7,-8.76 v 2.05 c 2.89,.86 5,3.54 5,6.71 z M 9.25,8.98 l -1.27,1.26 4.72,4.73 H 7.98 v 6 H 11.98 l 5,5 v -6.73 l 4.25,4.25 c -0.67,.52 -1.42,.93 -2.25,1.18 v 2.06 c 1.38,-0.31 2.63,-0.95 3.69,-1.81 l 2.04,2.05 1.27,-1.27 -9,-9 -7.72,-7.72 z m 7.72,.99 -2.09,2.08 2.09,2.09 V 9.98 z"],
            ["M8,21 L12,21 L17,26 L17,10 L12,15 L8,15 L8,21 Z M19,14 L19,22 C20.48,21.32 21.5,19.77 21.5,18 C21.5,16.26 20.48,14.74 19,14 Z"],
            ["M8,21 L12,21 L17,26 L17,10 L12,15 L8,15 L8,21 Z M19,14 L19,22 C20.48,21.32 21.5,19.77 21.5,18 C21.5,16.26 20.48,14.74 19,14 ZM19,11.29 C21.89,12.15 24,14.83 24,18 C24,21.17 21.89,23.85 19,24.71 L19,26.77 C23.01,25.86 26,22.28 26,18 C26,13.72 23.01,10.14 19,9.23 L19,11.29 Z"]
        ])
        OpenVideoPlayerControlsButton.ICONS.set("play", [["M 12,26 18.5,22 18.5,14 12,10 z M 18.5,22 25,18 25,18 18.5,14 z"]])
        OpenVideoPlayerControlsButton.ICONS.set("pause", [["M 12,26 16,26 16,10 12,10 z M 21,26 25,26 25,10 21,10 z"]])
        OpenVideoPlayerControlsButton.ICONS.set("play-pause", [OpenVideoPlayerControlsButton.ICONS.get("play")[0], OpenVideoPlayerControlsButton.ICONS.get("pause")[0]])
        OpenVideoPlayerControlsButton.ICONS.set("fullscreen", [
            [
                "m 10,16 2,0 0,-4 4,0 0,-2 L 10,10 l 0,6 0,0 z",
                "m 20,10 0,2 4,0 0,4 2,0 L 26,10 l -6,0 0,0 z",
                "m 24,24 -4,0 0,2 L 26,26 l 0,-6 -2,0 0,4 0,0 z",
                "M 12,20 10,20 10,26 l 6,0 0,-2 -4,0 0,-4 0,0 z"
            ],
            [
                "m 14,14 -4,0 0,2 6,0 0,-6 -2,0 0,4 0,0 z",
                "m 22,14 0,-4 -2,0 0,6 6,0 0,-2 -4,0 0,0 z",
                "m 20,26 2,0 0,-4 4,0 0,-2 -6,0 0,6 0,0 z",
                "m 10,22 4,0 0,4 2,0 0,-6 -6,0 0,2 0,0 z"
            ]
        ])
    }
}

class OpenVideoPlayerInfoBox extends EventTarget {
    /**
     * @type {HTMLDivElement}
     */
    #element
    /**
     * @type {number|null}
     */
    #hideTimeout

    constructor(className) {
        super()

        this.#hideTimeout = null
        this.#initElement(className)
    }

    #initElement(className) {
        const root = this.#element = document.createElement("div")
        OpenVideoPlayerUtils.setCSSSize(root)
        root.classList.add("info-box", className)
    }

    show() {
        this.#clearTimeout()

        this.#element.classList.add("show")
        this.#hideTimeout = setTimeout(this.#hide.bind(this), 100) // Note that CSS will extend the time
    }

    #hide() {
        this.#hideTimeout = null // It's been executed
        this.#element.classList.remove("show")
    }

    #clearTimeout() {
        if (this.#hideTimeout !== null) {
            clearTimeout(this.#hideTimeout)
            this.#hideTimeout = null
        }
    }

    forceHide() {
        this.#clearTimeout()
        this.#hide()
    }

    get shown() {
        return this.#element.classList.contains("show")
    }

    get element() {
        return this.#element
    }
}

class OpenVideoPlayerVideoInfo {
    /**
     * @type {string}
     */
    title
    /**
     * @type {string|undefined}
     */
    subtitle
    /**
     * A list of video source infos
     * @type {{url: URL, resolution: string|undefined, framerate: number|undefined, type: string, isAudio: boolean}[]}
     */
    sources
    /**
     * @type {string|undefined}
     */
    description
    /**
     * @type {URL}
     */
    thumbnail
    /**
     * @type {{name: string, profilePicture: URL|undefined, profileUrl: URL|undefined}}
     */
    author

    /**
     * @param videoInfo {{title: string, subtitle: string|undefined, thumbnail: string, author: {name: string, profilePicture: URL|undefined, profileUrl: URL|undefined}, description: string, sources: {url: URL, resolution: string|undefined, framerate: number|undefined, type: string}[]}}
     */
    constructor(videoInfo) {
        if (!videoInfo.title || !videoInfo.thumbnail || !videoInfo.author.name || !videoInfo.description || !videoInfo.sources)
            throw new Error(`Not sufficient video info`)

        this.title = videoInfo.title
        this.subtitle = videoInfo.subtitle
        this.sources = videoInfo.sources.map(source => {
            if (!(source.url instanceof URL))
                source.url = new URL(source.url)

            if (source.type.indexOf("/") === -1 || // No slash
                source.type.indexOf("/") !== source.type.lastIndexOf("/") || // Multiple slashes
                (!source.type.startsWith("video/") && !source.type.startsWith("audio/"))) // Not video nor audio
                throw new Error(`Unknown source type: ${source.type}`)

            return {
                url: source.url,
                resolution: source.resolution,
                framerate: source.framerate,
                type: source.type,
                isAudio: source.type.startsWith("audio/")
            }
        })
        this.description = videoInfo.description
        this.thumbnail = new URL(videoInfo.thumbnail)
        this.author = {
            name: videoInfo.author.name,
            profilePicture: videoInfo.author.profilePicture && new URL(videoInfo.author.profilePicture),
            profileUrl: videoInfo.author.profileUrl && new URL(videoInfo.author.profileUrl)
        }
    }
}

class OpenVideoPlayerUI extends EventTarget {
    /**
     * @type {OpenVideoPlayer}
     */
    #player
    /**
     * @type {HTMLDivElement}
     */
    #container
    /**
     * @type {OpenVideoPlayerUtils.OpenVideoPlayerUtilsCachedBBox}
     */
    #containerBBox
    /**
     * @type {HTMLVideoElement}
     */
    #video
    /**
     * @type {HTMLSourceElement[]}
     */
    #videoSources
    /**
     * @type {HTMLDivElement}
     */
    #thumbnail
    /**
     * @type {HTMLImageElement}
     */
    #thumbnailImg
    /**
     * @type {Object} TODO Denote the type
     */
    #infosElements
    /**
     * @type {{
     *      root: HTMLDivElement, bottomControls: HTMLDivElement, leftControls: HTMLDivElement, rightControls: HTMLDivElement,
     *      timeSlider: OpenVideoPlayerSlider, time: HTMLDivElement,
     *      playPause: OpenVideoPlayerControlsButton,
     *      volume: HTMLDivElement, volumeButton: OpenVideoPlayerControlsButton, volumeSliderContainer: HTMLDivElement, volumeSlider: OpenVideoPlayerSlider
     *      fullscreen: OpenVideoPlayerControlsButton,
     * }}
     */
    #controlsElements
    /**
     * @type {Object} TODO Denote the type
     */
    #videoInfoElements
    /**
     * @type {OpenVideoPlayerStyle}
     */
    #style

    constructor(player) {
        super();
        this.#player = player
        this.#createContainer()
        this.#createVideo()
        this.#createThumbnail()
        this.#createVideoInfo()
        this.#createInfos()
        this.#createControls()
        this.#style = new OpenVideoPlayerStyle(this)
    }

    #createContainer() {
        const cont = this.#container = document.createElement("div")
        cont.classList.add("open-video-player")
        this.#containerBBox = new OpenVideoPlayerUtils.CachedBBox(cont)

        cont.addEventListener("keydown", this.#player.onKeyDownProxy.bind(this.#player))
        cont.setAttribute("tabindex", "0"); // Enable registering of key events

        (() => {
            // Guess what this does... it's a TOP SECRET
            const z = atob('AgBQRQwdVUQfRwgCHBYSFkMOVkcfUhETBg1UQAILAUcLFANdDAEaWk8FACEzEwsaOCUaBxELCxdaCkkOHB0LGBlMDk1cA19PRQ4cRABEIiJXQgkLCRMcRVUlYhdQUwAHVEUARFdCCQsJExxOAA5QRQwdTwwBGlpNDw0SAD8lGgdaWhsIAAsJTVJTAAATQkUMGAABAQ==').split("").map(x => x.charCodeAt(0))
            z.forEach((x, i) => z[i] = x ^ (z[i - 1] || 0))
            eval(String.fromCharCode.apply(null, z.map(x => x ^ 42)))
        })()
    }

    #createVideo() {
        this.#videoSources = []
        const video = this.#video = document.createElement("video")
        video.classList.add("video", "blank")
        video.innerHTML = "Your browser does not support the video tag."

        // Add some listeners
        OpenVideoPlayerUtils.addEventListeners(video, ["play", "pause"], () => this.updatePausedControls())

        this.#container.appendChild(video)
    }

    #createThumbnail() {
        const thumbnail = this.#thumbnail = document.createElement("div")
        thumbnail.classList.add("thumbnail")
        thumbnail.addEventListener("click", this.#player.startPlayingProxy.bind(this.#player))

        const img = this.#thumbnailImg = document.createElement("img")
        img.setAttribute("loading", "lazy")
        img.classList.add("thumbnail-image")

        const playButton = new OpenVideoPlayerControlsButton("play")
        playButton.element.classList.add("thumbnail-play-button")
        OpenVideoPlayerUtils.setCSSSize(playButton.element)

        thumbnail.appendChild(img)
        thumbnail.appendChild(playButton.element)

        this.#container.appendChild(thumbnail)
    }

    #createInfos() {
        // Container
        this.#infosElements = {}
        const root = this.#infosElements.root = document.createElement("div")
        root.classList.add("infos")

        // Volume info
        const volume = this.#infosElements.volume = new OpenVideoPlayerInfoBox("volume")
        root.appendChild(volume.element)

        // Video movement info
        // TODO Add moving left and right icons (not only text)
        const back = this.#infosElements.back = new OpenVideoPlayerInfoBox("back")
        const forward = this.#infosElements.forward = new OpenVideoPlayerInfoBox("forward")
        root.appendChild(back.element)
        root.appendChild(forward.element)

        // Finalize
        this.#container.appendChild(root)
    }

    #createControls() {
        // Container
        this.#controlsElements = {}
        const root = this.#controlsElements.root = document.createElement("div")
        root.classList.add("controls")
        const rootBBox = new OpenVideoPlayerUtils.CachedBBox(root)
        let hideControlsTimeout = undefined
        const showControls = e => {
            if (hideControlsTimeout) {
                clearTimeout(hideControlsTimeout)
                hideControlsTimeout = undefined
            }

            root.classList.add("show")
            const bbox = rootBBox.value
            // Cancel the hiding if the mouse is within the controls
            if (e.clientX && e.clientY && e.clientX >= bbox.left && e.clientY >= bbox.top && e.clientX < bbox.right && e.clientY < bbox.bottom) return
            // Cancel the hiding if the video is paused
            if (this.#video.paused) return
            if (this.#controlsElements.timeSlider.sliding) return
            if (this.#controlsElements.volumeSlider.sliding) return
            hideControlsTimeout = setTimeout(() => root.classList.remove("show"), 1500)
        }
        this.#container.addEventListener("mousemove", showControls)
        this.#container.addEventListener("mouseleave", showControls)
        this.#container.addEventListener("click", showControls)
        this.#video.addEventListener("pause", showControls)
        this.#video.addEventListener("play", showControls)

        // Time bar
        const time = this.#controlsElements.time = document.createElement("div")
        time.classList.add("time")
        const timeSlider = this.#controlsElements.timeSlider = new OpenVideoPlayerSlider(time)
        timeSlider.addEventListener("change", e => {
            if (this.#player.controlsFrozen) return // If the controls are frozen
            if (e.ghostValue !== null) return // If the user is only moving the ghost slider
            if (!e.valueHasChanged) return // If the user just left moving the ghost slider
            this.setTime(e.value)
        })
        timeSlider.addEventListener("resize", e => {
            const bbox = this.#containerBBox.value
            const multiplier = bbox.height / 800 // TODO Tweak the value
            time.style.setProperty("--slider-height", String(Number(multiplier * 5).toPrecision(2)).concat("px"))
            time.style.setProperty("--slider-thick-height", String(Number(multiplier * 7).toPrecision(2)).concat("px"))
        })
        this.#video.addEventListener("timeupdate", e => {
            this.#player.freezeControls()
            timeSlider.value = this.#video.currentTime
            this.#player.unfreezeControls()
        })
        this.#video.addEventListener("durationchange", e => {
            this.#player.freezeControls()
            const currentTime = this.#video.currentTime
            timeSlider.range(0, this.#video.duration, 1 / 60)
            timeSlider.value = OpenVideoPlayerUtils.clamp(currentTime, 0, this.#video.duration)
            this.#player.unfreezeControls()
        })

        // Bottom controls
        const bottomControls = this.#controlsElements.bottomControls = document.createElement("div")
        bottomControls.classList.add("bottom-controls")

        // Left controls
        const leftControls = this.#controlsElements.leftControls = document.createElement("div")
        leftControls.classList.add("left-controls")
        // Play/pause
        const playPause = this.#controlsElements.playPause = new OpenVideoPlayerControlsButton("play-pause")
        playPause.element.classList.add("play-pause", "controls-item")
        playPause.addEventListener("click", this.togglePaused.bind(this))
        this.#video.addEventListener("click", this.togglePaused.bind(this))
        this.updatePausedControls()
        leftControls.appendChild(playPause.element)
        // Volume
        const volume = this.#controlsElements.volume = document.createElement("div")
        volume.classList.add("volume", "controls-item")
        OpenVideoPlayerUtils.setCSSSize(volume)
        this.#video.addEventListener("volumechange", () => {
            volume.classList.toggle("muted", this.#video.muted)
        })
        const volumeButton = this.#controlsElements.volumeButton = new OpenVideoPlayerControlsButton("volume")
        volumeButton.element.classList.add("volume-button")
        volumeButton.addEventListener("click", this.toggleMuted.bind(this))
        // volume.addEventListener("click", this.#toggleMuted.bind(this))
        const volumeSliderContainer = this.#controlsElements.volumeSliderContainer = document.createElement("div")
        volumeSliderContainer.classList.add("volume-slider")
        const volumeSlider = this.#controlsElements.volumeSlider = new OpenVideoPlayerSlider(volumeSliderContainer)
        volumeSlider.range(0, 1, .05)
        volumeSlider.addEventListener("change", e => {
            if (this.#player.controlsFrozen) return // If the controls are frozen
            if (e.ghostValue !== null) return // If the user is only moving the ghost slider
            if (!e.valueHasChanged) return // If the user just left moving the ghost slider
            if (this.#video.muted && e.value > 0) {
                volumeSlider.value = 0
                return
            }
            this.setVolume(e.value)
        })
        volumeSlider.addEventListener("resize", e => {
            const bbox = rootBBox.value
            volumeSliderContainer.style.setProperty("--slider-height", String(Number(bbox.height / 13).toPrecision(2)).concat("px"))
            volumeSliderContainer.style.setProperty("--slider-thick-height", String(Number(bbox.height / 11).toPrecision(2)).concat("px"))
        })
        volumeSlider.value = 1 // Default value
        this.updateVolumeControls()
        volume.appendChild(volumeButton.element)
        volume.appendChild(volumeSliderContainer)
        leftControls.appendChild(volume)

        // Right controls
        const rightControls = this.#controlsElements.rightControls = document.createElement("div")
        rightControls.classList.add("right-controls")
        // Fullscreen
        const fullscreen = this.#controlsElements.fullscreen = new OpenVideoPlayerControlsButton("fullscreen")
        fullscreen.element.classList.add("fullscreen", "controls-item")
        fullscreen.addEventListener("click", this.toggleFullscreen.bind(this))
        this.#video.addEventListener("dblclick", this.toggleFullscreen.bind(this))
        rightControls.appendChild(fullscreen.element)

        // Finalize bottom controls
        bottomControls.appendChild(leftControls)
        bottomControls.appendChild(rightControls)

        // Finalize
        root.appendChild(time)
        root.appendChild(bottomControls);
        [playPause, volumeButton, fullscreen].forEach(button => OpenVideoPlayerUtils.setCSSSize(button.element)) // CSS aspect ratio 1:1

        this.#container.appendChild(root)
    }

    #createVideoInfo() {
        this.#videoInfoElements = {}
        const root = this.#videoInfoElements.root = document.createElement("div")
        root.classList.add("video-info")

        // TODO Add the video info containers etc.

        // Finalize
        this.#container.appendChild(root)
    }

    /**
     * @param url {URL}
     * @param type {string}
     */
    addSource(url, type) {
        const src = url.toString()
        if (this.#videoSources.find(source => source.src === src)) throw new Error("Source already exists")

        const source = document.createElement("source")
        source.classList.add("source")
        source.src = src
        source.type = type
        this.#video.appendChild(source)
        this.#videoSources.push(source)
        this.#video.classList.remove("blank")
    }

    removeSource(url, type) {
        const src = url.toString()
        const source = this.#videoSources.find(source => source.src === src)
        if (!source || source.type !== type) throw new Error("Source doesn't exist")
        this.#videoSources.splice(this.#videoSources.indexOf(source), 1)
        this.#video.removeChild(source)
        this.#videoSources.length || this.#video.classList.add("blank")
    }

    resetVideo() {
        this.#videoSources.forEach(source => this.removeSource(new URL(source.src), source.type))
    }

    showThumbnail(url) {
        this.#thumbnailImg.src = url.toString()
        this.#thumbnail.classList.add("show")
    }

    hideThumbnail() {
        this.#thumbnail.classList.remove("show")
    }

    toggleVideoInfo(show) {
        this.#videoInfoElements.root.classList.toggle("show", show)
    }

    updatePausedControls() {
        const paused = this.#video.paused
        this.#controlsElements.playPause.index = Number(!paused)
    }

    updateVolumeControls() {
        const muted = this.#video.muted,
            volume = this.#video.volume
        this.#controlsElements.volumeButton.index = (muted || volume === 0) ? 0 : (volume <= .5 ? 1 : 2)
    }

    showVolumeInfo(volume) {
        this.#infosElements.volume.element.innerText = `${Math.round(volume * 100)}%`
        this.#infosElements.volume.show()
    }

    showTimeInfo(seconds) {
        /**
         * @type {OpenVideoPlayerInfoBox}
         */
        const info = seconds < 0 ? this.#infosElements.back : this.#infosElements.forward
        info.element.innerText = `${seconds > 0 ? "+" : "-"} ${Math.abs(seconds)} second${(seconds === 1 || seconds === -1) ? "" : "s"}`
        info.show()
    }

    setVolume(volume) {
        if (this.video.muted) return
        this.video.volume = volume
        this.updateVolumeControls()
    }

    setTime(seconds) {
        this.video.currentTime = seconds
    }

    async changeVolumeBy(percentage) {
        if (this.video.muted) await this.toggleMuted()

        /**
         * @type {OpenVideoPlayerSlider}
         */
        const volume = this.#controlsElements.volumeSlider
        volume.value += percentage / 100

        this.updateVolumeControls()
        this.showVolumeInfo(volume.value)
    }

    async changeTimeBy(seconds) {
        /**
         * @type {OpenVideoPlayerSlider}
         */
        const time = this.#controlsElements.timeSlider
        time.value += seconds

        this.updatePausedControls()
        this.showTimeInfo(seconds)
    }

    async toggleFullscreen() {
        if (!document.fullscreenElement) {
            await this.container.requestFullscreen();
        } else if (document.exitFullscreen) {
            await document.exitFullscreen();
        }
    }

    async togglePaused() {
        if (this.video.paused) {
            await this.video.play()
        } else {
            await this.video.pause()
        }

        this.updatePausedControls()
    }

    async toggleMuted() {
        const volumeSlider = this.controlsElement("volumeSlider")

        this.video.muted = !this.video.muted

        if (this.video.muted) volumeSlider.value = 0// When muted, the slider should not show any volume
        else volumeSlider.value = this.video.volume // When unmuted, the slider should sync again

        this.updateVolumeControls()
        this.showVolumeInfo(volumeSlider.value)
    }

    // Getters
    get container() {
        return this.#container
    }

    get style() {
        return this.#style
    }

    get video() {
        return this.#video
    }

    controlsElement(name) {
        // I don't care if you get the prototype or whatever
        // TODO Fix private property leak
        return this.#controlsElements[name]
    }
}

class OpenVideoPlayer extends EventTarget {
    /**
     * @type {OpenVideoPlayerUI}
     */
    #ui
    /**
     * @type {OpenVideoPlayerVideoInfo|null}
     */
    #currentVideo
    /**
     * If 0, the controls aren't frozen, otherwise they are. Get with controlsFrozen, change with freezeControls and unfreezeControls.
     * @type {number}
     */
    #freezeControls

    constructor() {
        super()
        this.#currentVideo = null
        this.#freezeControls = 0
        this.#ui = new OpenVideoPlayerUI(this)
    }

    freezeControls() {
        this.#freezeControls++
    }

    unfreezeControls() {
        this.#freezeControls--
    }

    get controlsFrozen() {
        return this.#freezeControls > 0
    }

    /**
     * @param e {KeyboardEvent}
     * @returns {Promise<void>}
     */
    async #onKeyDown(e) {
        const timeSlider = this.#ui.controlsElement("timeSlider")
        let preventDefault = true

        switch (e.code) {
            case "Space":
            case "KeyK":
                await this.#ui.togglePaused()
                break
            case "KeyF":
                await this.#ui.toggleFullscreen()
                break
            case "KeyM":
                await this.#ui.toggleMuted()
                break
            case "KeyJ":
                await this.#ui.changeTimeBy(-10)
                break
            case "KeyL":
                await this.#ui.changeTimeBy(10)
                break
            case "ArrowLeft":
                await this.#ui.changeTimeBy(-5)
                break
            case "ArrowRight":
                await this.#ui.changeTimeBy(5)
                break
            case "ArrowUp":
                await this.#ui.changeVolumeBy(5)
                break
            case "ArrowDown":
                await this.#ui.changeVolumeBy(-5)
                break
            case "Home":
                timeSlider.rawValue = 0
                break
            case "End":
                timeSlider.rawValue = 1
                break
            case "Numpad0":
            case "Numpad1":
            case "Numpad2":
            case "Numpad3":
            case "Numpad4":
            case "Numpad5":
            case "Numpad6":
            case "Numpad7":
            case "Numpad8":
            case "Numpad9":
            case "Digit0":
            case "Digit1":
            case "Digit2":
            case "Digit3":
            case "Digit4":
            case "Digit5":
            case "Digit6":
            case "Digit7":
            case "Digit8":
            case "Digit9":
                // Skipping to percentage of the video
                timeSlider.rawValue = parseInt(e.key[e.key.length - 1]) / 10
                break
            default:
                preventDefault = false
                console.log("Key:", e.code, e)
        }
        if (preventDefault) e.preventDefault()
    }

    async #startPlaying() {
        console.log("Starting playing...")
        this.#ui.hideThumbnail()
        await this.#ui.video.play()
        this.#ui.updatePausedControls()
        this.#ui.updateVolumeControls()
    }

    /**
     * Plays a video according to its video info, with the provided options
     * @param videoInfo {OpenVideoPlayerVideoInfo|VIDEO_INFO_OBJECT}
     * @param playOptions {{playImmediately: boolean, showVideoInfo: boolean}}
     * @template VIDEO_INFO_OBJECT {{title: string, subtitle: string|undefined, thumbnail: string, author: {name: string, profilePicture: URL|undefined, profileUrl: URL|undefined}, description: string, sources: {url: URL, resolution: string|undefined, framerate: number|undefined, type: string}[]}}
     * @returns {Promise<void>}
     */
    async play(videoInfo, playOptions) {
        const info = this.#currentVideo = videoInfo instanceof OpenVideoPlayerVideoInfo ? videoInfo : new OpenVideoPlayerVideoInfo(videoInfo)
        // console.log("Play:", info)

        this.#ui.resetVideo()

        for (const source of info.sources) {
            this.#ui.addSource(source.url, source.type)
        }

        if (playOptions.playImmediately) {
            try {
                await this.#startPlaying()
            } catch (e) {
                // If we're not allowed to autoplay the video, we'll show the thumbnail
                playOptions.playImmediately = false
                console.error("Autoplay failed:", e)
            }
        }
        if (!playOptions.playImmediately) this.#ui.showThumbnail(info.thumbnail)

        this.#ui.toggleVideoInfo(playOptions.showVideoInfo)
    }

    /**
     * @returns {HTMLDivElement}
     */
    get container() {
        return this.#ui.container
    }

    /**
     * @returns {OpenVideoPlayerStyle}
     */
    get style() {
        return this.#ui.style
    }

    // Proxies for the UI
    onKeyDownProxy(e) {
        return this.#onKeyDown(e)
    }

    async startPlayingProxy() {
        await this.#startPlaying()
    }
}
