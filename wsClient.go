// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// Method serve() is the Websocket handler for http-to-ws upgrade.
// Method handleClientMessage() is the Websocket signaling handler.
// KeepAliveMgr takes care of keeping ws-clients connected.

package main

import (
	"bytes"
	"time"
	"strings"
	"fmt"
	"strconv"
	"errors"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"sync"
	"github.com/lesismal/nbio/nbhttp/websocket"
)

const (
	pingPeriod = 60
	// we send a ping to the client when we didn't hear from it for pingPeriod secs
	// when we send a ping, we set the time for our next ping in pingPeriod secs after that
	// whenever we receive something from the client (data or a ping or a pong)
	// we reset the time for our next ping to be sent in pingPeriod secs after that moment
	// when pingPeriod expires, it means that we didn't hear from the client for pingPeriod secs
	// so we send our ping
	// and we set SetReadDeadline bc we expect to receive a pong in response within max 30s
	// if there is still no response from the client by then, we consider the client to be dead
	// in other words: we cap the connection if we don't hear from a client for pingPeriod + 30 secs

	// browser clients do not send pings, so it is only the server sending pings
	// new: android clients do not send pings anymore (for powermgmt reasons)
	// now outdated:
	//   android clients send pings to the server every 60 secs and we respond with pongs
	//   since the pingPeriod of android clients is shorter than that of this server,
	//   this server will in practice not send any pings to android clients
	//   say an android client sends a ping, the server sends a pong and shortly after the client reboots
	//   the server will wait for 90s without receiving anything from this client
	//   after 90s the server will send a ping to check the client
	//   after another 20s the server declares the client dead - 100s after the clients last ping
)

var keepAliveMgr *KeepAliveMgr
var ErrWriteNotConnected = errors.New("Write not connected")

type WsClient struct {
	hub *Hub
	wsConn *websocket.Conn
	mastodonID string
	mastodonSendTootOnCall bool
	askCallerBeforeNotify bool
	isOnline atomic.Bool	// connected to signaling server
	isConnectedToPeer atomic.Bool // before pickup
	isMediaConnectedToPeer atomic.Bool // after pickup
	pickupSent atomic.Bool
	calleeInitReceived atomic.Bool
	callerOfferForwarded atomic.Bool
	reached14s atomic.Bool
	calleeAnswerReceived chan struct{}
	RemoteAddr string // with port
	RemoteAddrNoPort string // no port
	userAgent string // ws UA
	calleeID string
	globalCalleeID string // unique calleeID for multiCallees as key for hubMap[]
	connType string
	callerID string
	callerName string
	callerHost string
	textMode string
	dialID string
	clientVersion string
	callerTextMsg string
	pingSent uint64
	pongReceived uint64
	pongSent uint64
	pingReceived uint64
	authenticationShown bool // whether to show "pion auth for client (%v) SUCCESS"
	isCallee bool
	autologin bool
}

func serveWs(w http.ResponseWriter, r *http.Request) {
	serve(w, r, false)
}

func serveWss(w http.ResponseWriter, r *http.Request) {
	serve(w, r, true)
}

func serve(w http.ResponseWriter, r *http.Request, tls bool) {
	if logWantedFor("wsverbose") {
		fmt.Printf("wsClient url=%s tls=%v\n", r.URL.String(), tls)
	}

	if keepAliveMgr==nil {
		keepAliveMgr = NewKeepAliveMgr()
		go keepAliveMgr.Run()
	}

	remoteAddr := r.RemoteAddr
	realIpFromRevProxy := r.Header.Get("X-Real-Ip")
	if realIpFromRevProxy!="" {
		remoteAddr = realIpFromRevProxy
	}

	remoteAddrNoPort := remoteAddr
	idxPort := strings.Index(remoteAddrNoPort,":")
	if idxPort>=0 {
		remoteAddrNoPort = remoteAddrNoPort[:idxPort]
	}

	var wsClientID64 uint64 = 0
	var wsClientData wsClientDataType
	url_arg_array, ok := r.URL.Query()["wsid"]
	if !ok || len(url_arg_array[0]) <= 0{
		return
	}
	wsClientIDstr := strings.ToLower(url_arg_array[0])
	wsClientID64, _ = strconv.ParseUint(wsClientIDstr, 10, 64)
	if wsClientID64<=0 {
		// not valid
		fmt.Printf("# wsClient invalid wsClientIDstr=%s %s url=%s\n",
			wsClientIDstr, remoteAddr, r.URL.String())
		return
	}
	//fmt.Printf("wsClient wsClientIDstr=%s wsClientID64=%d\n",wsClientIDstr,wsClientID64)
	wsClientMutex.Lock()
	wsClientData,ok = wsClientMap[wsClientID64]
	if ok {
		// ensure wsClientMap[wsClientID64] will not be removed
		wsClientData.removeFlag = false
		wsClientMap[wsClientID64] = wsClientData
	}
	wsClientMutex.Unlock()
	if !ok {
		// this callee has just exited, no need to log
		//fmt.Printf("wsClient ws=%d does not exist %s url=%s\n",
		//	wsClientID64, remoteAddr, r.URL.String())
		return
	}

	callerID := ""
	url_arg_array, ok = r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) > 0 {
		callerID = strings.ToLower(url_arg_array[0])
	}

	callerHost := ""
	url_arg_array, ok = r.URL.Query()["callerHost"]
	if ok && len(url_arg_array[0]) > 0 {
		callerHost = strings.ToLower(url_arg_array[0])
	}
	// callerIdLong = callerId @ callerHost
	callerIdLong := callerID
	if callerHost!="" && !strings.HasPrefix(callerHost,hostname) {
		if(strings.Index(callerIdLong,"@")>=0) {
			callerIdLong += "@"+callerHost
		} else {
			callerIdLong += "@@"+callerHost
		}
		//fmt.Printf("wsClient (%s) callerID=%s Long=%s callerHost=%s hostname=%s\n",
		//	wsClientData.calleeID, callerID, callerIdLong, callerHost, hostname)
	}

	callerName := ""
	url_arg_array, ok = r.URL.Query()["callerName"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerName = url_arg_array[0]
	}
	if callerName=="" {
		url_arg_array, ok = r.URL.Query()["name"]
		if ok && len(url_arg_array[0]) >= 1 {
			callerName = url_arg_array[0]
		}
	}

	// if callerName is empty, but callerIdLong and wsClientData.calleeID are set
	// we try to get callerName from the callee's contacts (but only if callerName is not 'unknown')
	if callerName=="" && callerIdLong!="" && wsClientData.calleeID!="" {
		if !strings.HasPrefix(wsClientData.calleeID,"answie") &&
		   !strings.HasPrefix(wsClientData.calleeID,"talkback") {
			// callerName is empty, but we got callerID and calleeID
			// try to fetch callerName by searching for callerID in contacts of calleeID
			//fmt.Printf("wsClient try to get callerName for callerID=%s via calleeID=%s\n",
			//	callerID, wsClientData.calleeID)
			var idNameMap map[string]string // callerID -> compoundName
			err := kvContacts.Get(dbContactsBucket,wsClientData.calleeID,&idNameMap)
			if err!=nil {
				fmt.Printf("# wsClient db get calleeID=%s (ignore) err=%v\n", wsClientData.calleeID, err)
			} else {
				compoundName := idNameMap[callerIdLong]
				tokenSlice := strings.Split(compoundName, "|")
				for idx, tok := range tokenSlice {
					switch idx {
						case 0: if tok!="unknown" { callerName = tok }
						//case 1:  = tok
						//case 2:  = tok
					}
				}
				if callerName!="" {
					if logWantedFor("contacts") {
						fmt.Printf("wsClient got callerName=%s for callerID=%s from contacts of calleeID=%s\n",
							callerName, callerIdLong, wsClientData.calleeID)
					}
				}
			}
		}
	}

	clientVersion := ""
	url_arg_array, ok = r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) > 0 {
		clientVersion = url_arg_array[0]
	}

	auto := ""
	url_arg_array, ok = r.URL.Query()["auto"]
	if ok && len(url_arg_array[0]) > 0 {
		auto = url_arg_array[0]
	}

	textMode := ""
	url_arg_array, ok = r.URL.Query()["text"]
	if ok && len(url_arg_array[0]) > 0 {
		textMode = strings.ToLower(url_arg_array[0])
	}

	upgrader := websocket.NewUpgrader()
	//upgrader.EnableCompression = true // TODO
	upgrader.CheckOrigin = func(r *http.Request) bool {
		return true
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("# Upgrade err=%v\n", err)
		return
	}
	wsConn := conn.(*websocket.Conn)
	//wsConn.EnableWriteCompression(true) // TODO

	// the only time browser clients can be expected to send anything, is after we sent a ping
	// this is why we set NO read deadline here; we do it when we send a ping
	wsConn.SetReadDeadline(time.Time{})

	client := &WsClient{wsConn:wsConn}
	client.calleeID = wsClientData.calleeID // this is the main-calleeID
	client.dialID = wsClientData.dialID
	client.globalCalleeID = wsClientData.globalID

/*
	dialID := wsClientData.dialID
	//fmt.Printf("wsClient calleeID=%s dialID=%s\n", client.calleeID, dialID)
	if dialID != "" && dialID != client.calleeID {
		// original dialID was mapped to client.calleeID
		mappingMutex.RLock()
		mappingData,ok := mapping[dialID]
		mappingMutex.RUnlock()
		if ok {
			// dialID is mapped (caller is using a mapped calleeID)
			// if a name was assigned for dialID, we attach it to callerName
			assignedName := mappingData.Assign
			if assignedName!="" && assignedName!="none" {
				if callerName=="" {
					callerName = "("+assignedName+")"
				} else if strings.Index(callerName,"(")<0 {
					callerName += " ("+assignedName+")"
				}
				if callerName!="" {
					fmt.Printf("wsClient callerName=%s for dialID=%s mappedID=%s(=%s)\n",
						callerName, dialID, mappingData.CalleeId, wsClientData.calleeID)
				}
			}
		}
	}
*/

	//fmt.Printf("serve (%s) callerID=%s callerName=%s auto=%s ver=%s/%s\n",
	//	wsClientData.calleeID, callerIdLong, callerName, auto, wsClientData.clientVersion, clientVersion)

	client.clientVersion = wsClientData.clientVersion
	if clientVersion!="" {
		client.clientVersion = clientVersion
	}
	if auto=="true" {
		client.autologin = true
	}
	client.callerID = callerIdLong
	client.callerName = callerName
	client.callerHost = callerHost
	client.textMode = textMode
	if tls {
		client.connType = "serveWss"
	} else {
		client.connType = "serveWs"
	}

	/*
	keepAliveMgr.Add(wsConn)
	// set the time for sending the next ping
	keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
	*/
	client.isOnline.Store(true)
	client.RemoteAddr = remoteAddr
	client.RemoteAddrNoPort = remoteAddrNoPort
	client.userAgent = r.UserAgent()
	client.authenticationShown = false // being used to make sure 'TURN auth SUCCESS' is only shown 1x per client

	hub := wsClientData.hub // set by /login wsClientMap[wsClientID] = wsClientDataType{...}
	client.hub = hub

	upgrader.OnMessage(func(wsConn *websocket.Conn, messageType websocket.MessageType, data []byte) {
		// clear read deadline; don't expect data from this cli for now; set it again when we send the next ping
		wsConn.SetReadDeadline(time.Time{})

		if(client.isCallee) {
			// push forward the time for sending the next ping
			// (whenever client sends anything, we postpone sending our next ping by pingPeriod secs)
			keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
		}

		switch messageType {
		case websocket.TextMessage:
			//fmt.Println("TextMessage:", messageType, string(data), len(data))
			n := len(data)
			if n>0 {
				//if logWantedFor("wsreceive") {
				//	max := n; if max>20 { max = 20 }
				//	fmt.Printf("%s (%s) received n=%d isCallee=%v (%s)\n",
				//		client.connType, client.calleeID, n, client.isCallee, data[:max])
				//}
				client.handleClientMessage(data, wsConn)
			}
		case websocket.BinaryMessage:
			fmt.Printf("# %s binary dataLen=%d\n", client.connType, len(data))
		}
	})

	upgrader.SetPongHandler(func(wsConn *websocket.Conn, s string) {
		// we received a pong from the client
		if logWantedFor("gotpong") {
			fmt.Printf("gotPong (%s) %s\n",client.calleeID, wsConn.RemoteAddr().String())
		}
		// clear read deadline; don't expect data from this cli for now; set it again when we send the next ping
		wsConn.SetReadDeadline(time.Time{})

		if(client.isCallee) {
			// push forward the time for sending the next ping: now + pingPeriod secs
			keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
		}
		client.pongReceived++
	})

	upgrader.SetPingHandler(func(wsConn *websocket.Conn, s string) {
		// received a ping from the client (this only happens in rare cases; usually we send pings to client)
		if logWantedFor("gotping") {
			fmt.Printf("gotPing (%s)\n",client.calleeID)
		}
		client.pingReceived++
		// clear read deadline; don't expect data from this cli for now; set it again when we send the next ping
		wsConn.SetReadDeadline(time.Time{})
		// send the pong
		err := wsConn.WriteMessage(websocket.PongMessage, nil)
		if err != nil {
			fmt.Printf("# sendPong (%s) %s err=%v\n",client.calleeID, client.wsConn.RemoteAddr().String(), err)
			if(client.isCallee) {
				// callee is gone
				client.hub.closeCallee("sendPong: "+err.Error())
				return
			}
			// caller is gone (this can only happen for as long as the server has not disconnected the caller,
			// so it is likely a manual (early/pre-14s) disconnect by the caller)
			// TODO so we might want to call closePeerCon() instead
			client.hub.closeCaller("sendPong: "+err.Error())
			return
		}
		if(client.isCallee) {
			// set the time for sending the next ping: now + pingPeriod secs
			keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
		}
		atomic.AddInt64(&pongSentCounter, 1)
		client.pongSent++
	})

	wsConn.OnClose(func(c *websocket.Conn, err error) {
		client.isOnline.Store(false) // prevent Close() from trying to close this already closed connection
		if client.isCallee {
			// callee has closed ws-con to server
			keepAliveMgr.Delete(c)
			// clear read deadline; we don't expect data from this cli
			c.SetReadDeadline(time.Time{})

			if logWantedFor("wsclose") {
				if err!=nil {
					fmt.Printf("%s (%s) OnClose callee err=%v %s v=%s\n",
						client.connType, client.calleeID, err, client.RemoteAddr, client.clientVersion)
				} else {
					fmt.Printf("%s (%s) OnClose callee noerr %s v=%s\n",
						client.connType, client.calleeID, client.RemoteAddr, client.clientVersion)
				}
			}
			// stop watchdog timer
			if client.hub!=nil {
				client.hub.HubMutex.RLock()
				if client.hub.CallerClient!=nil && client.hub.CallerClient.calleeAnswerReceived!=nil {
					client.hub.CallerClient.calleeAnswerReceived <- struct{}{}
				}
				client.hub.HubMutex.RUnlock()

				if err!=nil {
					client.hub.closeCallee("OnClose callee: "+ err.Error())
				} else {
					client.hub.closeCallee("OnClose callee: noerr")
				}
			}

		} else {
			// caller has closed ws-con to server
			if logWantedFor("wsclose") {
				if err!=nil {
					fmt.Printf("%s (%s) OnClose caller err=%v %s v=%s\n",
						client.connType, client.calleeID, err, client.RemoteAddr, client.clientVersion)
				} else {
					fmt.Printf("%s (%s) OnClose caller noerr %s v=%s\n",
						client.connType, client.calleeID, client.RemoteAddr, client.clientVersion)
				}
			}

			if client.hub!=nil {
				client.hub.HubMutex.RLock()
				if client.hub.CallerClient!=nil {
					client.hub.CallerClient.calleeAnswerReceived <- struct{}{}
				}
				client.hub.HubMutex.RUnlock()

				if !client.reached14s.Load() {
					// a caller disconnect before reached14s is definitely a manual discon by the caller
					// -> force closePeerCon
					if client.hub.CalleeClient!=nil {
						client.hub.CalleeClient.Write([]byte("cancel|OnCloseCaller"))  // TODO move to peerConHasEnded() ?
					}
					if err!=nil {
						client.hub.closePeerCon("OnCloseCaller "+err.Error())
					} else {
						client.hub.closePeerCon("OnCloseCaller noerr")
					}
				} else {
					// a caller disconnect after reached14s is a regular discon of the caller by the server
					// (see: disconCallerOnPeerConnected)
					// -> let peerCon alive, just close the caller
					// NOTE we treat err=read timeout like noerr (testing)
					if err!=nil && strings.Index(err.Error(),"read timeout")<0 {
						client.hub.closeCaller("OnCloseCaller "+err.Error())
					} else {
						client.hub.closeCaller("OnCloseCaller noerr")
					}
				}
			}
		}
	})

	hub.HubMutex.Lock()
	if hub.CalleeClient==nil {
		// callee client (1st client)
		if logWantedFor("wsclient") {
			fmt.Printf("%s (%s) callee conn ws=%d %s\n", client.connType,
				client.calleeID, wsClientID64, client.RemoteAddr)
		}
		client.isCallee = true
		client.calleeInitReceived.Store(false)
		client.mastodonID = wsClientData.dbUser.MastodonID
		client.mastodonSendTootOnCall = wsClientData.dbUser.MastodonSendTootOnCall
		client.askCallerBeforeNotify = wsClientData.dbUser.AskCallerBeforeNotify
		hub.IsCalleeHidden = wsClientData.dbUser.Int2&1!=0
		hub.IsUnHiddenForCallerAddr = ""
		hub.WsClientID = wsClientID64
		hub.CalleeClient = client // only hub.closeCallee() sets CalleeClient = nil
		hub.CallerClient = nil
		hub.ServiceStartTime = time.Now().Unix()

		if !strings.HasPrefix(client.calleeID,"random") {
			// get values related to talk- and service-time for this callee from the db
			// so that 1s-ticker can calculate the live remaining time
			hub.ServiceStartTime = wsClientData.dbEntry.StartTime // race?
			//hub.ConnectedToPeerSecs = int64(wsClientData.dbUser.ConnectedToPeerSecs)
		}

		hub.CallDurationSecs = 0
		hub.HubMutex.Unlock()

		keepAliveMgr.Add(wsConn)
		// set the time for sending the next ping
		keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
		return
	}

	if hub.CallerClient==nil {
		// caller client (2nd client)
		if logWantedFor("attach") {
			fmt.Printf("%s (%s) caller conn dialID=%s ws=%d (%s) %s\n", client.connType, client.calleeID,
				client.dialID, wsClientID64, callerIdLong, client.RemoteAddr)
		}

		client.isCallee = false
		client.callerOfferForwarded.Store(false)
		client.reached14s.Store(false)
		hub.CallDurationSecs = 0
		hub.CallerClient = client
		hub.CallerIpNoPort = client.RemoteAddrNoPort
		hub.CallerID = callerIdLong
		hub.lastCallerContactTime = time.Now().Unix()
		hub.HubMutex.Unlock()

		// connection watchdog now has two timeouts
		// 1. from when caller connects (now) to when callee sends calleeAnswer (max 60s)
		// 2. from when callee sends calleeAnswer to when p2p-connect should occur (max 14s)
		go func() {
			// NOTE: client is same as hub.CallerClient
			client.calleeAnswerReceived = make(chan struct{}, 8)
			secs := 60
			timer := time.NewTimer(time.Duration(secs) * time.Second)
			if logWantedFor("wsclose") {
				fmt.Printf("%s (%s) %ds timer start ws=%d\n",
					client.connType, client.calleeID, secs, wsClientID64)
			}
			select {
			case <-timer.C:
				// no calleeAnswer in response to callerOffer within 60s
				// we want to send cancel to both clients,
				// then disconnect the caller, reset the callee, and do peerConHasEnded
				if logWantedFor("wsclose") {
					fmt.Printf("%s (%s) %ds timer: time is up ws=%d\n",
						client.connType, client.calleeID, secs, wsClientID64)
				}
				hub.HubMutex.RLock()
				if hub.CallerClient!=nil {
					// disconnect caller's ws-connection (client is caller)
					client.Write([]byte("cancel|disconnect")) // ignore any errors
				}
				if hub.CalleeClient!=nil {
					// callee is here, disconnect caller's ws-connection
					err = hub.CalleeClient.Write([]byte("cancel|c"))
					if err != nil {
						// callee is gone
						fmt.Printf("# %s (%s) %ds timer: time is up, cancel msg to callee failed %v\n",
							hub.CalleeClient.connType, hub.CalleeClient.calleeID, secs, err)
						hub.HubMutex.RUnlock()
						hub.closeCallee("disconCallerAfter60s: cancel to callee: "+err.Error())
						return
					}
				}
				hub.HubMutex.RUnlock()

				// closePeerCon() will close the caller
				hub.closePeerCon("disconCallAfter60s")
				return
			case <-client.calleeAnswerReceived:
				// event coming from cmd=="calleeAnswer"
				// this is also used to signal "caller gone", but with CallerClient.isOnline=false
				if logWantedFor("wsclose") {
					fmt.Printf("%s (%s) %ds timer: calleeAnswerReceived ws=%d\n",
						client.connType, client.calleeID, secs, wsClientID64)
				}
				timer.Stop()
				// fall through, start 14s timer
			}

			delaySecs := 14
			// incoming caller will get removed if there is no peerConnect after 14s
			// (it can take up to 14 seconds in some cases for a devices to get fully out of deep sleep)
			myCallerContactTime := hub.lastCallerContactTime

			//fmt.Printf("%s (%s) caller conn 14s delay start\n", client.connType, client.calleeID)
			time.Sleep(time.Duration(delaySecs) * time.Second)
			//fmt.Printf("%s (%s) caller conn 14s delay end\n", client.connType, client.calleeID)

			hub.HubMutex.RLock()
			if hub.CalleeClient==nil {
				//fmt.Printf("%s (%s) no peercon check: callee gone (hub.CalleeClient==nil)\n",
				//	client.connType, client.calleeID)
				hub.HubMutex.RUnlock()
				return
			}
			if hub.CallerClient==nil {
				//fmt.Printf("%s (%s) no peercon check: caller gone (hub.CallerClient==nil)\n",
				//	client.connType, client.calleeID)
				hub.HubMutex.RUnlock()
				return
			}
			if !hub.CallerClient.isOnline.Load() {
				// this helps us to NOT throw a false NO PEERCON when the caller hanged up early
				// we don't ws-disconnect the caller on peercon, so we can detect a hangup shortly after
				//fmt.Printf("%s (%s) no peercon check: !CallerClient.isOnline\n",
				//	client.connType, client.calleeID)
				hub.HubMutex.RUnlock()
				return
			}
			if !hub.CallerClient.callerOfferForwarded.Load() {
				// caller has not sent a calleroffer yet -> it has hanged up early
				//fmt.Printf("%s (%s) no peercon check: !CallerClient.callerOfferForwarded\n",
				//	client.connType, client.calleeID)
				hub.HubMutex.RUnlock()
				return
			}

			client.reached14s.Store(true)
			// if isConnectedToPeer and disconCallerOnPeerConnected -> force discon caller (but not peercon) now!
			// caller onClose will from now on not anymore disconnect peercon on caller gone

			if hub.CalleeClient.isConnectedToPeer.Load() {
				// peercon steht; no peercon meldung nicht nötig; force caller ws-disconnect
				// we know this is the caller, shall it be ws-disconnected?
				readConfigLock.RLock()
				myDisconCallerOnPeerConnected := disconCallerOnPeerConnected
				readConfigLock.RUnlock()
				if myDisconCallerOnPeerConnected {
					// force-disconnect the caller WITHOUT disconnecting peerCon
					hub.HubMutex.RUnlock()
					if logWantedFor("wsclose") {
						fmt.Printf("%s (%s) reached14s -> force disconnect caller\n",
							client.connType, client.calleeID)
					}
					hub.closeCaller("disconCallerAfter14s") // this will clear .CallerClient
					return
				}
				if logWantedFor("wsclose") {
					fmt.Printf("%s (%s) reached14s -> do not force disconnect caller\n",
						client.connType, client.calleeID)
				}
				hub.HubMutex.RUnlock()
				return
			}

			if hub!=nil && myCallerContactTime != hub.lastCallerContactTime {
				// this callee is engaged with a new caller session already (myCallerContactTime is outdated)
				// TODO must investigate this
				hub.HubMutex.RUnlock()
				fmt.Printf("%s (%s) reached14s and no peerCon, but outdated %d != %d\n",
					client.connType, client.calleeID, myCallerContactTime, hub.lastCallerContactTime)
				return
			}

			// NO PEERCON: calleroffer received, but after 14s still no peer-connect: this is a webrtc issue
			// let's assume both sides are still ws-connected. let's send a status msg to both
			fmt.Printf("%s (%s) reached14s NO PEERCON📵 %ds %s <- %s (%s) %v ua=%s\n",
				client.connType, client.calleeID, delaySecs, hub.CalleeClient.RemoteAddr,
				client.RemoteAddr, client.callerID, client.isOnline.Load(), client.userAgent)

			// NOTE: msg MUST NOT contain apostroph (') characters
			msg := "Unable to establish a direct P2P connection. "+
			  "This might be a WebRTC related issue with your browser/WebView. "+
			  "Or with the browser/WebView on the other side. "+
			  "It could also be a firewall issue. "+
			  "On Android, run <a href=\"/webcall/android/#webview\">WebRTC-Check</a> "+
			  "to test your System WebView."
			err := client.Write([]byte("status|"+msg))
			if err != nil {
				// caller is gone
				fmt.Printf("%s (%s) failed to send NO PEERCON msg to caller %s err=%v\n",
					client.connType, client.calleeID, remoteAddr, err)
				// ignore err bc below we disconnect the caller anyway
			}

			if strings.HasPrefix(hub.CalleeClient.calleeID,"answie") ||
				strings.HasPrefix(hub.CalleeClient.calleeID,"talkback") {
				// if callee is answie or talkback, the problem must be with the caller side
				// don't send msg to callee
			} else {
				// this is a real callee-user
				err = hub.CalleeClient.Write([]byte("status|"+msg))
				if err != nil {
					// callee is gone
					fmt.Printf("%s (%s) failed to send NO PEERCON msg to callee %s err=%v\n",
						client.connType, client.calleeID, hub.CalleeClient.RemoteAddr, err)
					hub.HubMutex.RUnlock()
					hub.closeCallee("failed to send NO PEERCON msg to callee: "+err.Error())
					return
				}
			}
			hub.HubMutex.RUnlock()

			// let callee alive but close caller + clear CallerIpInHubMap
			hub.closePeerCon("NO PEERCON")
		}()
		return
	}
	hub.HubMutex.Unlock()

	// can be ignored
	//fmt.Printf("# %s (%s/%s) CallerClient already set [%s] %s ws=%d\n",
	//	client.connType, client.calleeID, client.globalCalleeID, hub.CallerClient.RemoteAddr,
	//	client.RemoteAddr, wsClientID64)
}

func (c *WsClient) handleClientMessage(message []byte, cliWsConn *websocket.Conn) {
	// check message integrity: cmd's can not be longer than 32 chars
	checkLen := 32
	if len(message) < checkLen {
		checkLen = len(message)
	}
	idxPipe := bytes.Index(message[:checkLen], []byte("|"))
	if idxPipe<0 {
		// invalid -> ignore
		//fmt.Printf("# serveWs receive no pipe char found; abort; checkLen=%d (%s)\n",
		//	checkLen,string(message[:checkLen]))
		return
	}
	tok := strings.Split(string(message),"|")
	if len(tok)!=2 {
		// invalid -> ignore
		fmt.Printf("# serveWs receive len(tok)=%d is !=2; abort; checkLen=%d idxPipe=%d (%s)\n",
			len(tok), checkLen, idxPipe, string(message[:checkLen]))
		return
	}

	//fmt.Printf("_ %s (%s) receive isCallee=%v %s %s\n",
	//	c.connType, c.calleeID, c.isCallee, c.RemoteAddr, cliWsConn.RemoteAddr().String())

	cmd := tok[0]
	payload := tok[1]
	if cmd=="init" {
		// note: c == c.hub.CalleeClient
		if !c.isCallee {
			// only the callee can send "init|"
			fmt.Printf("# %s (%s) deny init is not Callee %s\n", c.connType, c.calleeID, c.RemoteAddr)
			return
		}

		if c.hub==nil {
			fmt.Printf("# %s (%s) deny init c.hub==nil %s\n", c.connType, c.calleeID, c.RemoteAddr)
			return
		}

		if !c.calleeInitReceived.Load() {
			// on first init only
			fmt.Printf("%s (%s) init %s\n", c.connType, c.calleeID, c.RemoteAddr)
//			c.hub.HubMutex.Lock()
//			c.hub.CallerClient = nil
//			c.hub.HubMutex.Unlock()

			c.calleeInitReceived.Store(true)
			c.hub.CalleeLogin.Store(true)
			c.pickupSent.Store(false)

			// closeCallee() will call setDeadline(0) and processTimeValues() if this is false; then set it true
			c.callerTextMsg = ""

			if logWantedFor("attach") {
				loginCount := 0
				calleeLoginMutex.RLock()
				calleeLoginSlice,ok := calleeLoginMap[c.calleeID]
				calleeLoginMutex.RUnlock()
				if ok {
					loginCount = len(calleeLoginSlice)
				}
				fmt.Printf("%s (%s) init %d ws=%d %s v=%s\n",
					c.connType, c.calleeID, loginCount, c.hub.WsClientID, c.RemoteAddr, c.clientVersion)
			}

			// TODO clear blockMap[c.calleeID] ?
			//blockMapMutex.Lock()
			//delete(blockMap,c.calleeID)
			//blockMapMutex.Unlock()
		}

		// deliver the webcall codetag version string to callee
		err := c.Write([]byte("sessionId|"+codetag))
		if err != nil {
			fmt.Printf("# %s (%s) init send sessionId %s  <- to callee err=%v\n",
				c.connType, c.calleeID, c.RemoteAddr, err)
			c.hub.closeCallee("init, send sessionId to callee: "+err.Error())
			return
		}

		if !strings.HasPrefix(c.calleeID,"answie") && !strings.HasPrefix(c.calleeID,"talkback") {
			// send "newer client available"
			if clientUpdateBelowVersion!="" && !c.autologin {
				if c.clientVersion < clientUpdateBelowVersion {
					//fmt.Printf("%s (%s) init v=%s\n",c.connType,c.calleeID,c.clientVersion)
					// NOTE: msg MUST NOT contain apostroph (') characters
					msg := "Please upgrade WebCall client to "+
						   "<a href=\"/webcall/update/\">v"+clientUpdateBelowVersion+"&nbsp;or&nbsp;higher</a>"
					if logWantedFor("attach") {
						fmt.Printf("%s (%s) init %s %s send status %s\n",
							c.connType, c.calleeID, c.RemoteAddr, c.clientVersion, msg)
					}
					err = c.Write([]byte("status|"+msg))
					if err != nil {
						fmt.Printf("# %s (%s) init send status (%s) %s <- to callee err=%v\n",
							c.connType, c.calleeID, c.RemoteAddr, err)
						//c.hub.doUnregister(c, "init, send status to callee: "+err.Error())
						//return
					}
				}
			}

			// send list of waitingCaller to callee client
			var waitingCallerSlice []CallerInfo
			// err can be ignored
			kvCalls.Get(dbWaitingCaller,c.calleeID,&waitingCallerSlice)
			// before we send waitingCallerSlice
			// we remove all entries that are older than 10min
			countOutdated:=0
			for idx := range waitingCallerSlice {
				//fmt.Printf("%s (idx=%d of %d)\n", c.connType,idx,len(waitingCallerSlice))
				if idx >= len(waitingCallerSlice) {
					break
				}
				if time.Now().Unix() - waitingCallerSlice[idx].CallTime > 10*60 {
					// remove outdated caller from waitingCallerSlice
					waitingCallerSlice = append(waitingCallerSlice[:idx],
						waitingCallerSlice[idx+1:]...)
					countOutdated++
				}
			}
			var err error
			if countOutdated>0 {
				fmt.Printf("%s (%s) init deleted %d outdated from waitingCallerSlice\n",
					c.connType, c.calleeID, countOutdated)
				err = kvCalls.Put(dbWaitingCaller, c.calleeID, waitingCallerSlice, true) // skipConfirm
				if err!=nil {
					fmt.Printf("# %s (%s) init failed to store dbWaitingCaller\n",c.connType,c.calleeID)
				}
			}

			// send list of missedCalls to callee client
			var missedCallsSlice []CallerInfo
			// err can be ignored
			kvCalls.Get(dbMissedCalls,c.calleeID,&missedCallsSlice)
			// TODO must check if .DialID is still a valid ID for this callee
			// if a DialID is outdated, replace it with the calleeID - or with ""

			if len(waitingCallerSlice)>0 || len(missedCallsSlice)>0 {
				if logWantedFor("waitingCaller") {
					fmt.Printf("%s (%s) init waitingCaller=%d missedCalls=%d\n",c.connType,c.calleeID,
						len(waitingCallerSlice),len(missedCallsSlice))
				}
				// -> httpServer c.Write()
				waitingCallerToCallee(c.calleeID, waitingCallerSlice, missedCallsSlice, c)
			}
		}
		return
	}

	if cmd=="dummy" {
		fmt.Printf("%s (%s) dummy %s ip=%s ua=%s\n",
			c.connType, c.calleeID, payload, c.RemoteAddr, c.userAgent)
		err := c.Write([]byte(payload))
		if err != nil {
			fmt.Printf("# %s (%s) send dummy reply (isCallee=%v) error\n",
				c.connType, c.isCallee, c.calleeID)
			c.hub.closeCallee("send dummy: "+err.Error())
		}
		return
	}

	if cmd=="msg" {
		// sent by caller on hangup without mediaconnect
		logTxtMsg := "(hidden)" // don't log actual cleanMsg
		if c.hub==nil {
			// don't log actual cleanMsg
			fmt.Printf("# %s (%s) msg='%s' c.hub==nil callee=%v ip=%s ua=%s\n",
				c.connType, c.calleeID, logTxtMsg, c.isCallee, c.RemoteAddr, c.userAgent)
			return
		}

		c.hub.HubMutex.Lock()
		if c.hub.CalleeClient==nil {
			// don't log actual cleanMsg
			c.hub.HubMutex.Unlock()
			fmt.Printf("# %s (%s) msg='%s' c.hub.CalleeClient==nil callee=%v ip=%s ua=%s\n",
				c.connType, c.calleeID, logTxtMsg, c.isCallee, c.RemoteAddr, c.userAgent)
			return
		}

		cleanMsg := strings.Replace(payload, "\n", " ", -1)
		cleanMsg = strings.Replace(cleanMsg, "\r", " ", -1)
		cleanMsg = strings.TrimSpace(cleanMsg)
		if cleanMsg == c.hub.CalleeClient.callerTextMsg {
			// same text msg was already processed / forwarded
			c.hub.HubMutex.Unlock()
			return
		}

		fmt.Printf("%s (%s) msg='%s' callee=%v ip=%s ua=%s\n",
			c.connType, c.calleeID, logTxtMsg, c.isCallee, c.RemoteAddr, c.userAgent)
		c.hub.CalleeClient.callerTextMsg = cleanMsg;
		c.hub.HubMutex.Unlock()
		return	// do NOT let msg fall thru; so it will NOT be fw to other side
	}

	if cmd=="missedcall" {
		// sent by caller on hangup without mediaconnect
		fmt.Printf("%s (%s) missedcall='%s' callee=%v ip=%s ua=%s\n",
			c.connType, c.calleeID, payload, c.isCallee, c.RemoteAddr, c.userAgent)
		//c.hub.CalleeClient.callerTextMsg = payload;
		missedCall(payload, c.RemoteAddr, "cmd=missedcall")
		return
	}

	if cmd=="callerOffer" {
		// caller starting a call - payload is JSON.stringify(localDescription)
		// note: c == c.hub.CallerClient
		if c.callerOfferForwarded.Load() {
			// prevent double callerOffer
			//fmt.Printf("# %s (%s) CALL from %s was already forwarded\n",
			//	c.connType, c.calleeID, c.RemoteAddr)
			return
		}

		//fmt.Printf("%s (%s) callerOffer... %s\n", c.connType, c.calleeID, c.RemoteAddr)

		c.hub.HubMutex.RLock()
		if c.hub.CalleeClient==nil {
			fmt.Printf("# %s (%s) CALL⚡ from (%s) %s but hub.CalleeClient==nil\n",
				c.connType, c.calleeID, c.callerID, c.RemoteAddr)
			c.hub.HubMutex.RUnlock()
			return
		}
		// prevent this callee from receiving a call, when already in a call
		if c.hub.ConnectedCallerIp!="" {
			// ConnectedCallerIp is set below by StoreCallerIpInHubMap()
			fmt.Printf("# %s (%s) CALL⚡ but hub.ConnectedCallerIp not empty (%s) <- (%s) %s\n",
				c.connType, c.calleeID, c.hub.ConnectedCallerIp, c.callerID, c.RemoteAddr)

			// add missed call if dbUser.StoreMissedCalls is set
			userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
			var dbUser DbUser
			err := kvMain.Get(dbUserBucket, userKey, &dbUser)
			if err!=nil {
				fmt.Printf("# %s (%s) failed to get dbUser\n",c.connType,c.calleeID)
			} else if dbUser.StoreMissedCalls {
				addMissedCall(c.calleeID, CallerInfo{c.RemoteAddr, c.callerName,
					time.Now().Unix(), c.callerID, c.dialID, c.callerTextMsg }, "callee busy")
			}
			c.hub.HubMutex.RUnlock()
			return
		}

		fmt.Printf("%s (%s) CALL⚡ %s <- %s (%s) T=%s v=%s ua=%s\n",
			c.connType, c.calleeID, c.hub.CalleeClient.RemoteAddr,
				c.RemoteAddr, c.callerID, c.textMode, c.clientVersion, c.userAgent)

		// forward the callerOffer message to the callee client
		err := c.hub.CalleeClient.Write(message)
		if err != nil {
			// callee is gone
			fmt.Printf("! %s (%s) CALL CalleeClient.Write(calleroffer) fail %v\n",
				c.connType, c.calleeID, err)
			c.hub.HubMutex.RUnlock()
			c.hub.closeCallee("send callerOffer to callee: "+err.Error())
			return
		}
		c.callerOfferForwarded.Store(true)

		c.hub.CalleeClient.Write([]byte("textmode|"+c.textMode))

		// send callerInfo to callee (see callee.js if(cmd=="callerInfo"))
		// 'callerInfo' is so important for the Android client we want to always send it, so remove the condition
		//if c.callerID!="" || c.callerName!="" {
			// this data is used to display caller-info in the callee-client
			// NOTE: c.callerID and c.callerHost must not contain colons
			sendCmd := "callerInfo|"+c.callerID+"\t"+c.callerName
			// if txtMsg exists, attach it to callerInfo as 3rd token
			if c.hub.CalleeClient.callerTextMsg!="" {
				sendCmd += "\t"+c.hub.CalleeClient.callerTextMsg
			}
			fmt.Printf("%s (%s) CALL sendCmd=%s\n", c.connType, c.calleeID, sendCmd)
			err = c.hub.CalleeClient.Write([]byte(sendCmd))
			if err != nil {
				// callee is gone
				fmt.Printf("! %s (%s) CALL CalleeClient.Write(callerInfo) fail %v\n",
					c.connType, c.calleeID, err)
				c.hub.HubMutex.RUnlock()
				c.hub.closeCallee("send callerInfo to callee: "+err.Error())
				return
			}
		//}

		// send calleeInfo (with dbUser.Name) to caller (see caller.js if(cmd=="calleeInfo"))
		if c.dialID == "" {
			// c.calleeID was not mapped from dialID (caller has called callee's main-ID)
			// send calleeInfo (with dbUser.Name) back to caller
			//fmt.Printf("%s (%s) CALL dialID not set (caller called callee's main ID)\n", c.connType, c.calleeID)

			// read dbUser for dbUser.Name
			userKey := c.hub.CalleeClient.calleeID +"_"+strconv.FormatInt(int64(c.hub.registrationStartTime),10)
			var dbUser DbUser
			err := kvMain.Get(dbUserBucket, userKey, &dbUser)
			if err!=nil {
				fmt.Printf("# %s (%s) fail get dbUser.Name\n", c.connType, c.hub.CalleeClient.calleeID)
			} else {
				if dbUser.Name!="" {
					sendCmd := "calleeInfo|"+c.hub.CalleeClient.calleeID+"\t"+dbUser.Name
					err = c.Write([]byte(sendCmd))
					if err != nil {
						// caller is gone
						fmt.Printf("! %s (%s) fail sending calleeInfo to caller %v\n",
							c.connType, c.hub.CalleeClient.calleeID, err)
						c.hub.HubMutex.RUnlock()
						c.hub.closePeerCon("send calleeInfo to caller: "+err.Error())
						return
					}
				}
			}
		} else {
			// c.calleeID was mapped from dialID (caller has NOT called callee's main-ID)
			// do NOT send calleeInfo (with dbUser.Name) back to caller
			//fmt.Printf("%s (%s) CALL dialID=%s (caller did NOT call callee's main ID)\n",
			//	c.connType, c.calleeID, c.dialID)
		}

		// send caller useragent to callee
		err = c.hub.CalleeClient.Write([]byte("ua|"+c.userAgent))
		if err != nil {
			// callee is gone
			fmt.Printf("# %s (%s) send caller ua to callee fail (early callee ws-disconnect?) %v\n",
				c.connType, c.calleeID, err)
			c.hub.HubMutex.RUnlock()
			c.hub.closeCallee("send caller ua to callee: "+err.Error())
			return
		}
		
		// send callee useragent to caller
		err = c.Write([]byte("ua|"+c.hub.CalleeClient.userAgent))
		c.hub.HubMutex.RUnlock()
		if err != nil {
			// caller hang up already?
			fmt.Printf("# %s (%s) send callee-ua to caller fail (early caller ws-disconnect?) %v\n",
				c.connType, c.calleeID, err)
			c.hub.closePeerCon("send callee ua to caller "+err.Error())
			return
		}

		if c.hub.maxRingSecs>0 {
			// if callee does NOT pickup the call after c.hub.maxRingSecs, callee will be disconnected
			c.hub.setDeadline(c.hub.maxRingSecs,"serveWs ringsecs")
		}
		// this will block other callers
		// this is also needed for turn AuthHandler: store caller RemoteAddr
		err = StoreCallerIpInHubMap(c.globalCalleeID, c.RemoteAddr, false)
		if err!=nil {
			fmt.Printf("# %s (%s) callerOffer StoreCallerIp %s err=%v\n",
				c.connType, c.globalCalleeID, c.RemoteAddr, err)
		} else {
			if logWantedFor("wscall") {
				fmt.Printf("%s (%s) callerOffer StoreCallerIp %s\n",
					c.connType, c.globalCalleeID, c.RemoteAddr)
			}
		}
		return
	}

	if cmd=="calleeAnswer" {
		if c.hub!=nil && c.hub.CallerClient!=nil {
			if logWantedFor("wsclose") {
				fmt.Printf("%s (%s) calleeAnswer forward to caller %s\n", c.connType, c.calleeID, c.RemoteAddr)
			}
			c.hub.CallerClient.calleeAnswerReceived <- struct{}{}
		} else {
			if logWantedFor("wsclose") {
				fmt.Printf("%s (%s) calleeAnswer no c.hub.CallerClient %s\n", c.connType, c.calleeID, c.RemoteAddr)
			}
		}
		// must still forward calleeAnswer to caller (see below: cmd/payload to other client)
	}

	if cmd=="rtcConnect" {
		return
	}

	if cmd=="cancel" {
		if logWantedFor("wsclose") {
			fmt.Printf("%s (%s) cmd=cancel callee=%v payload=%s %s\n",
				c.connType, c.calleeID, c.isCallee, payload, c.RemoteAddr)
		}
		if c.hub==nil {
			fmt.Printf("! %s cmd=cancel but c.hub==nil %s (%s)\n",c.connType,c.RemoteAddr,payload)
			return
		}
		c.hub.HubMutex.RLock()
		if c.hub.CalleeClient==nil {
			c.hub.HubMutex.RUnlock()
			// we receive a "cmd=cancel|" (from the caller?) but the callee is logged out
			fmt.Printf("! %s cmd=cancel but c.hub.CalleeClient==nil %s (%s)\n",c.connType,c.RemoteAddr,payload)
			c.hub.closeCallee("callee already gone")
			return
		}

		if c.hub.CalleeClient.isConnectedToPeer.Load() {
			//fmt.Printf("%s (%s) cmd=cancel CalleeClient.isConnectedToPeer c.isCallee=%v\n",
			//	c.connType,c.calleeID,c.isCallee)
			if c.isCallee && payload!="disconnectByCaller" {
				// callee client is disconnecting the caller
				fmt.Printf("%s (%s) REQ PEER DISCON %s by callee cancel='%s'\n",
					c.connType, c.calleeID, c.RemoteAddr, payload)
				// end the peer-connection
				// we need to fw "cancel|" to the caller so it stops waiting for pickup
				if c.hub.CallerClient!=nil {
					c.hub.CallerClient.Write([]byte("cancel|"+payload)) // TODO better move to peerConHasEnded() ?
				}
				c.hub.HubMutex.RUnlock()
				c.hub.closePeerCon("callee "+payload)
				return
			}
			// caller client is disconnecting the callee
			// c.RemoteAddr is callee-ip (c.hub.CallerClient may be nil already)
			fmt.Printf("%s (%s) REQ PEER DISCON %s <- by caller cancel='%s'\n",
				c.connType, c.calleeID, c.RemoteAddr, payload)
			// end the peer-connection
			// we need to fw "cancel|" to the callee so it stops ringing
			c.hub.CalleeClient.Write([]byte("cancel|"+payload)) // TODO better move to peerConHasEnded() ?
			c.hub.HubMutex.RUnlock()
			c.hub.closePeerCon("caller "+payload)
			return
		} else {
			// no peercon: we should still forward "cancel" to the other side
			//fmt.Printf("%s (%s) cmd=cancel !CalleeClient.isConnectedToPeer c.isCallee=%v\n",
			//	c.connType,c.calleeID,c.isCallee)
			if c.isCallee {
				// callee fw disconnect to caller
				if c.hub.CallerClient!=nil {
					fmt.Printf("%s (%s) FW PEER DISCON from callee %s cancel='%s'\n",
						c.connType, c.calleeID, c.RemoteAddr, payload)
					// callee wants the caller gone
					c.hub.CallerClient.Write([]byte(message)) // ignore any error

					//timer.Stop()
					c.hub.CallerClient.isOnline.Store(false)	// ???
					c.hub.CallerClient.calleeAnswerReceived <- struct{}{}
					c.hub.HubMutex.RUnlock()

					// TODO in some cases, when we just did a closePeerCon(), we don't want to call it again
					c.hub.closePeerCon("caller cancel")
					return
				}
			} else {
				// caller fw disconnect to callee
				if c.hub.CalleeClient!=nil {
					fmt.Printf("%s (%s) FW PEER DISCON from caller %s cancel='%s'\n",
						c.connType, c.calleeID, c.RemoteAddr, payload)
					if c.hub.CallerClient!=nil {
						// timer.Stop()
						c.isOnline.Store(false)	// ???
						c.calleeAnswerReceived <- struct{}{}
					}
					err := c.hub.CalleeClient.Write([]byte(message))
					c.hub.HubMutex.RUnlock()
					if err != nil {
						fmt.Printf("# %s (%s) fw caller-cancel to callee fail %v\n",
							c.connType, c.calleeID, err)
						c.hub.closeCallee("fw caller-cancel to callee: "+err.Error())
						return
					}

					// let callee re-init
					// TODO in some cases, when we just did a closePeerCon(), we don't want to call it again
					c.hub.closePeerCon("caller sent cancel")
					return
				}
			}
		}
		c.hub.HubMutex.RUnlock()
		return
	}

	if cmd=="calleeHidden" {
		//fmt.Printf("%s cmd=calleeHidden from %s (%s)\n",c.connType,c.RemoteAddr,payload)
		c.hub.HubMutex.Lock()
		if(payload=="true") {
			c.hub.IsCalleeHidden = true
		} else {
			c.hub.IsCalleeHidden = false
		}
		c.hub.IsUnHiddenForCallerAddr = ""
		calleeHidden := c.hub.IsCalleeHidden
		c.hub.HubMutex.Unlock()

		/* only need to do this if a global hub is being used (c.hub.IsCalleeHidden already set above)
		// forward state of c.isHiddenCallee to globalHubMap
		err := SetCalleeHiddenState(c.calleeID, calleeHidden)
		if err != nil {
			// via dbLayer.go: return locSetCalleeHiddenState(calleeId, hidden)
			// hubMap[c.calleeID] == nil (in skvLayer.go)
			fmt.Printf("# serveWs (%s) SetCalleeHiddenState %v err=%v\n", c.calleeID, calleeHidden, err)
		}
		*/

		// read dbUser for IsCalleeHidden flag
		// store dbUser after set/clear IsCalleeHidden in dbUser.Int2&1
		userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
		var dbUser DbUser
		err := kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# serveWs (%s) cmd=calleeHidden db=%s bucket=%s getX key=%v err=%v\n",
				c.calleeID, dbMainName, dbUserBucket, userKey, err)
		} else {
			if calleeHidden {
				dbUser.Int2 |= 1
			} else {
				dbUser.Int2 &= ^1
			}
			fmt.Printf("%s (%s) set hidden=%v %d %s\n", c.connType, c.calleeID,
				calleeHidden, dbUser.Int2, c.RemoteAddr)
			err := kvMain.Put(dbUserBucket, userKey, dbUser, true) // skipConfirm
			if err!=nil {
				fmt.Printf("# serveWs (%s) calleeHidden db=%s bucket=%s put key=%v %s err=%v\n",
					c.calleeID, dbMainName, dbUserBucket, userKey, c.RemoteAddr, err)
			} else {
				//fmt.Printf("%s calleeHidden db=%s bucket=%s put key=%v OK\n",
				//	c.connType, dbMainName, dbUserBucket, userKey)
				/*
				// this was used for verification only
				var dbUser2 DbUser
				err := kvMain.Get(dbUserBucket, userKey, &dbUser2)
				if err!=nil {
					fmt.Printf("# serveWs calleeHidden verify db=%s bucket=%s getX key=%v err=%v\n",
						dbMainName, dbUserBucket, userKey, err)
				} else {
					fmt.Printf("serveWs calleeHidden verify userKey=%v isHiddenCallee=%v (%d)\n",
						userKey, dbUser2.Int2&1!=0, dbUser2.Int2)
				}
				*/
			}
		}
		return
	}

	if cmd=="dialsoundsmuted" {
		// only used by clients up to v3.5.5 (we need to keep this for as long as clients<=3.5.5 are in use)
		dialSoundsMuted := false
		if(payload=="true") {
			dialSoundsMuted = true
		}

		// read dbUser for dialSoundsMuted flag
		userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
		var dbUser DbUser
		err := kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# serveWs (%s) cmd=dialsounds db=%s bucket=%s getX key=%v err=%v\n",
				c.calleeID, dbMainName, dbUserBucket, userKey, err)
		} else {
			// store dbUser after set/clear dialSoundsMuted in dbUser.Int2&4
			if dialSoundsMuted {
				dbUser.Int2 |= 4
			} else {
				dbUser.Int2 &= ^4
			}
			fmt.Printf("%s (%s) set dialSoundsMuted=%v %d %s %s\n", c.connType, c.calleeID,
				dialSoundsMuted, dbUser.Int2, userKey, c.RemoteAddr)
			err := kvMain.Put(dbUserBucket, userKey, dbUser, true) // skipConfirm
			if err!=nil {
				fmt.Printf("# serveWs (%s) dialSoundsMuted db=%s bucket=%s put key=%v %s err=%v\n",
					c.calleeID, dbMainName, dbUserBucket, userKey, c.RemoteAddr, err)
			}
		}
		return
	}

	if cmd=="pickupWaitingCaller" {
		// for callee only
		// payload = ip:port
		callerAddrPort := payload
		fmt.Printf("%s pickupWaitingCaller from %s (%s)\n", c.connType, c.RemoteAddr, callerAddrPort)
		// this will end the frozen xhr call by the caller in httpNotifyCallee.go (see: case <-c)
		waitingCallerChanMap[callerAddrPort] <- 1
		return
	}

	if cmd=="deleteMissedCall" {
		// for callee only: payload = ip:port:callTime
		callerAddrPortPlusCallTime := payload
		//fmt.Printf("%s deleteMissedCall from %s callee=%s (payload=%s)\n",
		//	c.connType, c.RemoteAddr, c.calleeID, callerAddrPortPlusCallTime)

		// remove this call from dbMissedCalls for c.calleeID
		// first: load dbMissedCalls for c.calleeID
		var missedCallsSlice []CallerInfo
		userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
		var dbUser DbUser
		err := kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# %s (%s) failed to get dbUser\n",c.connType,c.calleeID)
		} else if dbUser.StoreMissedCalls {
			err = kvCalls.Get(dbMissedCalls,c.calleeID,&missedCallsSlice)
			if err!=nil {
				fmt.Printf("# serveWs deleteMissedCall (%s) failed to read dbMissedCalls\n",c.calleeID)
			}
		}
		if len(missedCallsSlice)>0 {
			//fmt.Printf("serveWs deleteMissedCall (%s) found %d entries\n",
			//	c.calleeID, len(missedCallsSlice))
			if callerAddrPortPlusCallTime=="all" {
				missedCallsSlice = nil
				err := kvCalls.Put(dbMissedCalls, c.calleeID, missedCallsSlice, false)
				if err!=nil {
					fmt.Printf("# serveWs deleteMissedCall (%s) fail store dbMissedCalls\n", c.calleeID)
				}
				// send modified missedCallsSlice to callee
				json, err := json.Marshal(missedCallsSlice)
				if err != nil {
					fmt.Printf("# serveWs deleteMissedCall (%s) failed json.Marshal\n", c.calleeID)
				} else {
					//fmt.Printf("deleteMissedCall send missedCallsSlice %s\n", c.calleeID)
					c.hub.HubMutex.RLock()
					if c.hub.CalleeClient!=nil {
						err = c.Write([]byte("missedCalls|"+string(json)))
						if err != nil {
							fmt.Printf("# %s (%s) send missedCalls fail %v\n",
								c.connType, c.calleeID, err)
							c.hub.HubMutex.RUnlock()
							c.hub.closeCallee("send missedCalls to callee: "+err.Error())
							return
						}
					}
					c.hub.HubMutex.RUnlock()
				}
				return
			}
			// search for callerIP:port + CallTime == callerAddrPortPlusCallTime
			for idx := range missedCallsSlice {
				//id := fmt.Sprintf("%s_%d",missedCallsSlice[idx].AddrPort,missedCallsSlice[idx].CallTime)
				id := missedCallsSlice[idx].AddrPort + "_" +
					 strconv.FormatInt(int64(missedCallsSlice[idx].CallTime),10)
				//fmt.Printf("deleteMissedCall %s compare (%s==%s)\n", callerAddrPortPlusCallTime, id)
				if id == callerAddrPortPlusCallTime {
					//fmt.Printf("serveWs deleteMissedCall idx=%d\n",idx)
					missedCallsSlice = append(missedCallsSlice[:idx], missedCallsSlice[idx+1:]...)
					// store modified dbMissedCalls for c.calleeID
					err := kvCalls.Put(dbMissedCalls, c.calleeID, missedCallsSlice, false)
					if err!=nil {
						fmt.Printf("# serveWs deleteMissedCall (%s) fail store dbMissedCalls\n", c.calleeID)
					}
					// send modified missedCallsSlice to callee
					json, err := json.Marshal(missedCallsSlice)
					if err != nil {
						fmt.Printf("# serveWs deleteMissedCall (%s) failed json.Marshal\n", c.calleeID)
					} else {
						//fmt.Printf("deleteMissedCall send missedCallsSlice %s\n", c.calleeID)
						c.hub.HubMutex.RLock()
						if c.hub.CalleeClient!=nil {
							err = c.Write([]byte("missedCalls|"+string(json)))
							if err != nil {
								fmt.Printf("# %s (%s) send missedCalls fail %v\n",
									c.connType, c.calleeID, err)
								c.hub.HubMutex.RUnlock()
								c.hub.closeCallee("send missedCalls to callee: "+err.Error())
								return
							}
						}
						c.hub.HubMutex.RUnlock()
					}
					break
				}
			}
		}
		return
	}

	if cmd=="pickup" {
		// "pickup" is sent by the callee client only
		if !c.isConnectedToPeer.Load() {
			//if logWantedFor("login") {
				fmt.Printf("# %s (%s) pickup ignored no peerConnect %s\n",
					c.connType, c.calleeID, c.RemoteAddr)
			//}
			return
		}
		if c.pickupSent.Load() {
			// prevent sending 'pickup' twice
			fmt.Printf("# %s (%s) pickup ignored, already sent %s\n",
				c.connType, c.calleeID, c.RemoteAddr)
			return
		}

		c.hub.HubMutex.Lock()
		c.hub.lastCallStartTime = time.Now().Unix()
		c.hub.HubMutex.Unlock()
		if logWantedFor("hub") {
			fmt.Printf("%s (%s) pickup online=%v peerCon=%v starttime=%d\n",
				c.connType, c.calleeID, c.isOnline.Load(), c.isConnectedToPeer.Load(), c.hub.lastCallStartTime)
		}
		c.hub.HubMutex.RLock()
		if c.hub.CallerClient!=nil {
			// deliver "pickup" to the caller
			if logWantedFor("wscall") {
				fmt.Printf("%s (%s) forward pickup to caller (%s)\n", c.connType, c.calleeID, message)
			}
			err := c.hub.CallerClient.Write(message)
			if err != nil {
				fmt.Printf("# %s (%s) send cancel msg to caller fail %v\n", c.connType, c.calleeID, err)
				c.hub.HubMutex.RUnlock()
				c.hub.closePeerCon("forward pickup to caller "+err.Error())
				return
			}
			c.pickupSent.Store(true)
		} else {
			fmt.Printf("# %s (%s) send cancel msg to caller fail: no c.hub.CallerClient\n", c.connType, c.calleeID)
		}
		c.hub.HubMutex.RUnlock()
		c.hub.setDeadline(0,"pickup")
		return
	}

	if cmd=="heartbeat" {
		// ignore: clients may send this to check the connection to the server
		return
	}

	if cmd=="check" {
		// clients may send this to check communication with the server
		// server sends payload back to client
		err := c.Write([]byte("confirm|"+payload))
		if err != nil {
			// client is gone
			fmt.Printf("# %s (%s) send confirm for check (callee=%v) fail %v\n",
				c.connType, c.calleeID, c.isCallee, err)
			if c.isCallee {
				c.hub.closeCallee("send confirm for check: "+err.Error())
				return
			}
			c.hub.closePeerCon("send confirm for check: "+err.Error())
		}
		return
	}

	if cmd=="log" {
		// TODO make extra sure payload is not malformed
		if c==nil {
			fmt.Printf("# peer c==nil\n")
			return
		}
		if c.hub==nil {
			fmt.Printf("# %s (%s) peer c.hub==nil v=%s\n", c.connType, c.calleeID, c.clientVersion)
			return
		}

		c.hub.HubMutex.RLock()
		if c.hub.CalleeClient==nil {
			c.hub.HubMutex.RUnlock()
			fmt.Printf("# %s (%s) peer %s c.hub.CalleeClient==nil v=%s\n",
				c.connType, c.calleeID, payload, c.clientVersion)
			return
		}

		// payload = "callee Connected p2p/p2p"
		tok := strings.Split(payload, " ")

		// payload = "callee Incoming p2p/p2p" or "callee Connected p2p/p2p"
		// "%s (%s) peer callee Incoming p2p/p2p" or "%s (%s) peer callee Connected p2p/p2p"
		// note: "callee Connected p2p/p2p" can happen multiple times
		constate := ""
		constateShort := "-"
		p2pRelayedInfo := ""
		if len(tok)>=2 {
			constate = strings.TrimSpace(tok[1])
			if constate=="Incoming"  { constateShort = "RING" }
			if constate=="Connected" { constateShort = "CONN" }
			if constate=="ConForce"  { constateShort = "CONF" }
			if len(tok)>=3 {
				p2pRelayedInfo = tok[2]
			}
		}
		if tok[0]=="callee" {
			if(constateShort=="RING") {
				fmt.Printf("%s (%s) PEER %s %s🔔 %s %s <- %s (%s)\n",
					c.connType, c.calleeID, tok[0], constateShort, p2pRelayedInfo, c.hub.CalleeClient.RemoteAddrNoPort,
					c.hub.CallerIpNoPort, c.hub.CallerID)

				// forward special ring indicator to caller
				if c.hub.CallerClient!=nil {
					c.hub.CallerClient.Write([]byte("ring|"))
				}
			} else {
				fmt.Printf("%s (%s) PEER %s %s☎️  %s %s <- %s (%s)\n",
					c.connType, c.calleeID, tok[0], constateShort, p2pRelayedInfo, c.hub.CalleeClient.RemoteAddrNoPort,
					c.hub.CallerIpNoPort, c.hub.CallerID)
			}
		} else {
			if strings.HasPrefix(constate,"Con") && !c.isConnectedToPeer.Load() {
				fmt.Printf("%s (%s) PEER %s %s☎️  %s %s <- %s (%s)\n",
					c.connType, c.calleeID, tok[0], constateShort, p2pRelayedInfo, c.hub.CalleeClient.RemoteAddrNoPort,
					c.hub.CallerIpNoPort, c.hub.CallerID)
			} else {
				fmt.Printf("%s (%s) PEER %s %s %s %s <- %s (%s)\n",
					c.connType, c.calleeID, tok[0], constateShort, p2pRelayedInfo, c.hub.CalleeClient.RemoteAddrNoPort,
					c.hub.CallerIpNoPort, c.hub.CallerID)
			}
		}

		if c.hub.CallerClient==nil {
			// caller gone
			c.hub.HubMutex.RUnlock()
			// we abort here bc below c.hub.CallerClient is needed
			return
		}

		if len(tok)>=2 && (constate=="Incoming" || constate=="Connected" || constate=="ConForce") {
			//fmt.Printf("%s (%s) set ConnectedToPeer\n", c.connType, c.calleeID)
			// note: we only make sure that callee has this always set
			// if we only get "Incoming" for callee, then isConnectedToPeer will not be set for CallerClient
			c.isConnectedToPeer.Store(true) // this is peer-connect, not full media-connect
			if !c.isCallee {
				// when the caller sends "log", the callee also becomes peerConnected
				c.hub.CalleeClient.isConnectedToPeer.Store(true)
			}

			c.hub.LocalP2p = false
			c.hub.RemoteP2p = false
			if p2pRelayedInfo!="" {
				tok2string := strings.TrimSpace(p2pRelayedInfo)
				tok2 := strings.Split(tok2string, "/")
				if len(tok2)>=2 {
					//fmt.Printf("%s tok2[0]=%s tok2[1]=%s\n", c.connType, tok2[0], tok2[1])
					if tok2[0]=="p2p" {
						c.hub.LocalP2p = true
					}
					if tok2[1]=="p2p" {
						c.hub.RemoteP2p = true
					}
				} else {
					fmt.Printf("# %s tok2string=%s has no slash\n", c.connType, tok2string)
				}
			} else {
				fmt.Printf("# %s len(tok)<3\n", c.connType)
			}

			if constate=="Connected" || constate=="ConForce" {
				if c.isCallee {
					// callee reports: peer connected (this may happen multiple times)
					if !c.isMediaConnectedToPeer.Load() {
						// only on 1st callee peer connect: set peer media connect for both sides
						c.isMediaConnectedToPeer.Store(true)
						c.hub.CallerClient.isMediaConnectedToPeer.Store(true)

						if maxClientRequestsPer30min>0 {
							clientRequestsMutex.Lock()
							delete(clientRequestsMap,c.RemoteAddrNoPort)
							delete(clientRequestsMap,c.hub.CallerIpNoPort)
							clientRequestsMutex.Unlock()

							// clear calleeLoginMap[c.calleeID] (to prevent '/login (id) 12 >= 12 logins/30m')
							calleeLoginMutex.Lock()
							//calleeLoginMap[c.calleeID] = nil
							delete(calleeLoginMap,c.calleeID)
							calleeLoginMutex.Unlock()
						}

						// store the caller (c.hub.CallerID)
						// into contacts of user being called (c.calleeID)
						// setContact() checks if dbUser.StoreContacts is set for c.calleeID
						// TODO what if only "@host"
						if c.hub.CallerID != "" {
							// we don't have callerId + callerName for this contact yet
							compoundName := c.hub.CallerClient.callerName+"||"
							setContact(c.calleeID, c.hub.CallerID, compoundName,
								c.RemoteAddrNoPort, "wsClient")
						}

						if c.hub.maxTalkSecsIfNoP2p>0 && (!c.hub.LocalP2p || !c.hub.RemoteP2p) {
							// relayed con: set deadline maxTalkSecsIfNoP2p
							//if logWantedFor("deadline") {
							//	fmt.Printf("%s (%s) setDeadline maxTalkSecsIfNoP2p %d %v %v\n", c.connType,
							//		c.calleeID, c.hub.maxTalkSecsIfNoP2p, c.hub.LocalP2p, c.hub.RemoteP2p)
							//}
							// deliver max talktime to both clients
							c.hub.doBroadcast(
								[]byte("sessionDuration|"+strconv.FormatInt(int64(c.hub.maxTalkSecsIfNoP2p),10)))
							c.hub.HubMutex.RUnlock()

							c.hub.setDeadline(c.hub.maxTalkSecsIfNoP2p,"peer con")
							return
						}
					}
				} else {
					// caller reports: peer connected
					if constate=="ConForce" {
						// test-caller sends this msg to callee, test-clients do not really connect p2p
						err := c.hub.CalleeClient.Write([]byte("callerConnect|"))
						if err != nil {
							// callee gone
							fmt.Printf("# %s (%s) send callerConnect to callee fail %v\n",
								c.connType, c.calleeID, err)
							c.hub.HubMutex.RUnlock()
							c.hub.closeCallee("send callerConnect to callee: "+err.Error())
							return
						}

					} else if constate=="Connected" {
						// caller is reporting peerCon
						// now force ws-disconnect caller
						// but only if 14s has passed

						if !c.hub.CallerClient.reached14s.Load() {
							if logWantedFor("wsclose") {
								fmt.Printf("%s (%s) peercon before reached14s, no force caller ws-disconnect\n",
									c.connType, c.calleeID)
							}
						} else {
							// shall caller be ws-disconnected after peer-con?
							readConfigLock.RLock()
							myDisconCallerOnPeerConnected := disconCallerOnPeerConnected
							readConfigLock.RUnlock()
							if myDisconCallerOnPeerConnected {
								if c.hub.CallerClient != nil {
									if logWantedFor("wsclose") {
										fmt.Printf("%s (%s) peercon -> force caller ws-disconnect %s\n",
											c.connType, c.calleeID, c.RemoteAddr)
									}
									c.hub.HubMutex.RUnlock()
									// here we disconnect the caller WITHOUT disconnecting peerCon
									c.hub.closeCaller("disconCallerOnPeerConnected") // will clear .CallerClient
									return
								}
							}
						}
					}
				}
			}
		}
		c.hub.HubMutex.RUnlock()
		return
	}

	if len(payload)>0 {
		// forward cmd/payload to other client
		if c.hub!=nil {
			if logWantedFor("wsreceive") {
				fmt.Printf("%s (%s) recv/fw %s|%s iscallee=%v %s\n",
					c.connType, c.calleeID, cmd, payload, c.isCallee, c.RemoteAddr)
			} else {
				//fmt.Printf("%s recv/fw %s iscallee=%v %s\n",
				//	c.connType, cmd, c.isCallee, c.RemoteAddr)
			}
			c.hub.HubMutex.RLock()
			if c.isCallee {
				if c.hub.CallerClient!=nil {
					err := c.hub.CallerClient.Write(message)
					if err != nil {
						// caller gone
						fmt.Printf("# %s (%s) fw msg to caller fail %v\n",
							c.connType, c.calleeID, err)
						// saw err = 'not connected'
						c.hub.HubMutex.RUnlock()
						c.hub.closePeerCon("fw msg to caller "+err.Error())
						return
					}
				} else {
					fmt.Printf("# %s (%s) fw msg to CallerClient==nil\n", c.connType, c.calleeID)
				}
			} else {
				// c is caller
				if c.hub.CalleeClient!=nil {
					err := c.hub.CalleeClient.Write(message)
					if err != nil {
						// callee gone
						fmt.Printf("# %s (%s) fw msg to callee fail %v\n",
							c.connType, c.calleeID, err)
						c.hub.HubMutex.RUnlock()
						c.hub.closeCallee("fw msg to callee: "+err.Error())
						return
					}
				} else {
					fmt.Printf("# %s (%s) fw msg to CalleeClient==nil\n", c.connType, c.calleeID)
				}
			}
			c.hub.HubMutex.RUnlock()
		}
	} else {
		//fmt.Printf("%s %s with no payload\n",c.connType,cmd)
	}
}

func (c *WsClient) Write(b []byte) error {
	max := len(b); if max>22 { max = 22 }
	if !c.isOnline.Load() {
		//fmt.Printf("# %s Write (%s) to %s callee=%v peerCon=%v NOT ONLINE\n",
		//	c.connType, b[:max], c.calleeID, c.isCallee, c.isConnectedToPeer.Load())
		return ErrWriteNotConnected
	}
	if logWantedFor("wswrite") {
		fmt.Printf("%s Write (%s) to %s callee=%v peerCon=%v\n",
			c.connType, b[:max], c.calleeID, c.isCallee, c.isConnectedToPeer.Load())
	}

	return c.wsConn.WriteMessage(websocket.TextMessage, b)
}

func (c *WsClient) Close(reason string) {
	// Close() is only called by hub.closeCaller() and hub.closeCallee()
	if logWantedFor("wsclose") {
		fmt.Printf("%s (%s) Close callee=%v online=%v '%s'\n",
			c.connType, c.calleeID, c.isCallee, c.isOnline.Load(), reason)
	}

	if c.isOnline.Load() {
		// this client is still ws-connected to server
		fmt.Printf("%s (%s) Close: force disconnect callee=%v '%s'\n",
			c.connType, c.calleeID, c.isCallee, reason)
		c.wsConn.WriteMessage(websocket.CloseMessage, nil) // ignore any error
		c.wsConn.Close()
	}

	if c.isCallee {
		// do nothing
	} else {
		if c.hub!=nil && c.hub.CallerClient!=nil {
			// this caller might still be ringing: stop the watchdog timer
			//if logWantedFor("wsclose") {
			//	fmt.Printf("%s (%s) Close caller: stop watchdog timer (just in case)\n", c.connType, c.calleeID)
			//}
			c.hub.CallerClient.calleeAnswerReceived <- struct{}{}
			// hub.closeCaller() takes care of hub.CallerClient = nil
		}
	}
}

func (c *WsClient) SendPing(maxWaitMS int) {
	// we expect a pong (or anything) from the client within max 20 secs from now
	// currently we are sending pings only to callees
	if maxWaitMS<0 {
		maxWaitMS = 20000
	}

	if logWantedFor("sendping") {
		fmt.Printf("sendPing (%s) %s maxWaitMS=%d\n",c.calleeID, c.wsConn.RemoteAddr().String(), maxWaitMS)
	}

	err := c.wsConn.WriteMessage(websocket.PingMessage, nil)
	if err != nil {
		fmt.Printf("# sendPing (%s) %s err=%v\n", c.calleeID, c.wsConn.RemoteAddr().String(), err)
		c.isOnline.Store(false) // ??? prevent Close() from trying to close this already closed connection
		if c.hub!=nil {
			comment := "sendPing error: "+err.Error()
			c.hub.closeCallee(comment)
			/*
			// instead:
			c.hub.LocalP2p = false
			c.hub.RemoteP2p = false
			fmt.Printf("# sendPing (%s) %s setDeadline()\n", c.calleeID, c.wsConn.RemoteAddr().String())
			c.hub.setDeadline(0,comment)
			if c.hub.CalleeClient!=nil {
				fmt.Printf("# sendPing (%s) %s keepAliveMgr.Delete\n", c.calleeID, c.wsConn.RemoteAddr().String())
				keepAliveMgr.Delete(c.hub.CalleeClient.wsConn)
				c.hub.CalleeClient.wsConn.SetReadDeadline(time.Time{})
				c.hub.CalleeClient.isConnectedToPeer.Store(false)
				c.hub.CalleeClient.isMediaConnectedToPeer.Store(false)
				c.hub.CalleeClient.pickupSent.Store(false)
			}
			*/
		}
		fmt.Printf("# sendPing (%s) %s done\n", c.calleeID, c.wsConn.RemoteAddr().String())
		return
	}

	c.pingSent++
	if maxWaitMS>0 {
		// set the time by when a (pong) response from this client would be too late
		c.wsConn.SetReadDeadline(time.Now().Add(time.Duration(maxWaitMS)*time.Millisecond))
	}
	// set the time for sending the next ping in pingPeriod secs from now
	keepAliveMgr.SetPingDeadline(c.wsConn, pingPeriod, c)
}


// KeepAliveMgr done with kind support from lesismal of github.com/lesismal/nbio
// Keeping many idle clients alive: https://github.com/lesismal/nbio/issues/92 
type KeepAliveMgr struct {
	mux       sync.RWMutex
	clients   map[*websocket.Conn]struct{}
}

func NewKeepAliveMgr() *KeepAliveMgr {
	return &KeepAliveMgr{
		clients: make(map[*websocket.Conn]struct{}),
	}
}

type KeepAliveSessionData struct {
	pingSendTime time.Time
	client *WsClient
}

func (kaMgr *KeepAliveMgr) SetPingDeadline(wsConn *websocket.Conn, secs int, client *WsClient) {
	// set the absolute time for sending the next ping
	wsConn.SetSession(&KeepAliveSessionData{
		time.Now().Add(time.Duration(secs)*time.Second), client})
}

func (kaMgr *KeepAliveMgr) Add(c *websocket.Conn) {
	kaMgr.mux.Lock()
	defer kaMgr.mux.Unlock()
	kaMgr.clients[c] = struct{}{}
}

func (kaMgr *KeepAliveMgr) Delete(c *websocket.Conn) {
	kaMgr.mux.Lock()
	defer kaMgr.mux.Unlock()
	delete(kaMgr.clients,c)
}

func (kaMgr *KeepAliveMgr) Run() {
	ticker := time.NewTicker(2*time.Second)
	defer ticker.Stop()
	for {
		<-ticker.C
		if shutdownStarted.Load() {
			break
		}
		kaMgr.mux.RLock()
		myClients := make([]*websocket.Conn, len(kaMgr.clients))
		i:=0
		for wsConn := range kaMgr.clients {
			myClients[i] = wsConn
			i++
		}
		kaMgr.mux.RUnlock()

		var nPing int64 = 0
		timeNow := time.Now()
		for _,wsConn := range myClients {
			keepAliveSessionData := wsConn.Session().(*KeepAliveSessionData)
			if keepAliveSessionData!=nil {
				if timeNow.After(keepAliveSessionData.pingSendTime) {
					keepAliveSessionData.client.SendPing(-1)
					nPing++
				}
			}
		}
		atomic.AddInt64(&pingSentCounter, nPing)
	}
}

