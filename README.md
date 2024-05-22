# Open Video Player

Open Video Player is an open source JavaScript-based video player for the web. It allows a lot of flexibility when it
comes to providing videos and advertisements to it, while keeping its look pretty uniform among websites. That's so
users don't use a completely new video player on every website. It is inspired by the YouTube video player.

## Example code
```javascript
const player = new OpenVideoPlayer()
document.body.appendChild(player.container)

// Video from https://gist.github.com/jsturgis/3b19447b304616f18657
// Full info is in example.html
const videoInfo = {
    "title": "Big Buck Bunny",
    "description": "...",
    "sources": [
        {
            "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "type": "video/mp4"
        }
    ],
    "thumbnail": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
    "author": {
        "name": "The Blender Foundation"
    }
}

player.play(videoInfo, {playImmediately: false})
```
