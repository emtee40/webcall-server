<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall Telephony Server

Current release: v4.0.1

- Audio Telephony
- Video Telephony
- TextChat
- File Transfer
- Always P2P
- Always E2EE

WebCall server operates 100% self-contained. No 3rd party services are being used.

To make calls you only need a 2020+ web browser (on any OS including Android and iOS).

You can receive direct P2P calls from anyone on the internet. 

Audio delivery with up to 320kbps in both directions producing an incredible audio quality.

Give WebCall Answie a live call: [timur.mobi/user/answie](https://timur.mobi/user/answie)

Audio and video can be turned off and on during a call.
This lets you use TextChat and File Transfer without any media overhead.

WebCall-Mastodon Bridge can deliver call notifications into your Mastodon inbox.

More info: [timur.mobi/webcall](https://timur.mobi/webcall)

# Native Clients

Native WebCall client for Android:

[codeberg.org/timurmobi/webcall-android](https://codeberg.org/timurmobi/webcall-android)

WebCall for Android can receive calls at any time, including when the device is in deep sleep.

More info: [timur.mobi/webcall/android](https://timur.mobi/webcall/android)

# Build the Server

With Go 1.19 run: go build

Then run: ./webcall

[timur.mobi/webcall/install](https://timur.mobi/webcall/install)

(Please use tagged releases only.)

# License

AGPL3.0 - see: [LICENSE](LICENSE)

## 3rd party code (referenced)

- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/mattn/go-mastodon
- github.com/pion/turn
- github.com/webrtcHacks/adapter.js

## 3rd party code (embedded)

- github.com/RapidLoop: skv
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()

