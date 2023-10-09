<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall Telephony Server

P2P E2EE Web Telephony based on WebRTC:

- Audio Telephony
- Video Telephony
- TextChat
- File Transfer

WebCall P2P calls are always end-to-end encrypted.

Audio is delivered with up to 320kbps in both directions
with better quality than most internet radio stations.

Audio and video delivery can be turned off and on during the call.
This allows you to use TextChat and File Transfer without any media overhead.

WebCall server operates fully self-contained.
No 3rd party services (STUN, TURN, etc.) are being used, so that 
no external parties can track your calls.

To use WebCall all you need is a 2020+ web browser on Android, iPhone, Windows, macOS or Linux.
You can receive calls from anyone on the internet.

WebCall-Mastodon Bridge can deliver call notifications into your Mastodon inbox.

More info: [timur.mobi/webcall](https://timur.mobi/webcall)

# Native Clients

Native WebCall client for Android:

[codeberg.org/timurmobi/webcall-android](https://codeberg.org/timurmobi/webcall-android)

More info: [timur.mobi/webcall/android](https://timur.mobi/webcall/android)

# Building

With Go 1.19 run: go build

[timur.mobi/webcall/install](https://timur.mobi/webcall/install)

# License

AGPL3.0 - see: [LICENSE](LICENSE)

## 3rd party code (external)

- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/mattn/go-mastodon
- github.com/pion/turn
- github.com/webrtcHacks/adapter.js

## 3rd party code (embedded)

- github.com/RapidLoop: skv
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()

