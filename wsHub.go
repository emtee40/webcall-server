// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// wsHub is a holder for two ws-clients: callee and caller.

package main

import (
	"fmt"
	"time"
	"sync"
	"strconv"
	"sync/atomic"
)

type Hub struct {
	CalleeClient *WsClient
	CallerClient *WsClient
	timer *time.Timer // expires when durationSecs ends; terminates session
	timerCanceled chan struct{}
	exitFunc func(uint64, string)
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string // will be set on callerOffer
	CallerIpNoPort string
	CallerID string
	WsUrl string
	WssUrl string
	calleeUserAgent string // http UA
	HubMutex sync.RWMutex
	CalleeLogin atomic.Bool // CalleeClient is connected to signaling server and has sent "init"
	WsClientID uint64 // set by the callee; will be handed over to the caller via /online
	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	lastCallStartTime int64
	lastCallerContactTime int64
	ServiceStartTime int64
	CallDurationSecs int64 // single call secs
	maxRingSecs int //durationSecs1 int // max wait secs till caller arrives
	maxTalkSecsIfNoP2p int // durationSecs2
	IsCalleeHidden bool
	LocalP2p bool
	RemoteP2p bool
}

func newHub(maxRingSecs int, maxTalkSecsIfNoP2p int, startTime int64) *Hub {
	return &Hub{
		maxRingSecs:            maxRingSecs,
		maxTalkSecsIfNoP2p:     maxTalkSecsIfNoP2p,
		registrationStartTime:  startTime,
		LocalP2p:               false,
		RemoteP2p:              false,
	}
}

func (h *Hub) setDeadline(secs int, comment string) {
	// will disconnect peercon after some time
	// by sending cancel to both clients and then by calling peerConHasEnded
	if h.timer!=nil {
		if logWantedFor("deadline") {
			fmt.Printf("setDeadline (%s) cancel running timer; new secs=%d (%s)\n",
				h.CalleeClient.calleeID, secs, comment)
		}
		// cancel running timer early (trigger h.timer.C below)
		h.timerCanceled <- struct{}{}
		// let running timer be canceled before we (might) set a new one
		time.Sleep(10 * time.Millisecond)
	}

	if(secs>0) {
		if logWantedFor("deadline") {
			fmt.Printf("setDeadline (%s) create %ds (%s)\n", h.CalleeClient.calleeID, secs, comment)
		}
		h.timer = time.NewTimer(time.Duration(secs) * time.Second)
		h.timerCanceled = make(chan struct{})
		go func() {
			timeStart := time.Now()
			select {
			case <-h.timer.C:
				// timer event: we need to disconnect the (relayed) clients (if still connected)
				h.timer = nil
				if h.CalleeClient!=nil && h.CalleeClient.isConnectedToPeer.Load() {
					fmt.Printf("! setDeadline (%s) reached; quit session now (secs=%d %v)\n",
						h.CalleeClient.calleeID, secs, timeStart.Format("2006-01-02 15:04:05"))
					calleeID := ""
					if h.CalleeClient!=nil {
						calleeID = h.CalleeClient.calleeID
					}
					if h.CallerClient!=nil {
						var message = []byte("cancel|s")
						fmt.Printf("! setDeadline (%s) send to caller (%s) %s\n",
							calleeID, message, h.CallerClient.RemoteAddr)
						h.CallerClient.Write(message)
						// in response, caller will send msgboxText to server and will hangup
					}

					// we wait for msg|... (to set callerTextMsg)
					time.Sleep(1 * time.Second)
					h.HubMutex.RLock()
					if h.CalleeClient!=nil && h.CalleeClient.isConnectedToPeer.Load() {
						var message = []byte("cancel|c")
						// only cancel callee if canceling caller wasn't possible
						fmt.Printf("setDeadline (%s) send to callee (%s) %s\n",
							calleeID, message, h.CalleeClient.RemoteAddr)
						h.CalleeClient.Write(message)
					}
					h.HubMutex.RUnlock()

					// NOTE: peerConHasEnded may call us back / this is why we have set h.timer=nil first (above)
					h.HubMutex.Lock()
					h.peerConHasEnded(fmt.Sprintf("deadline%d",secs)) // will set h.CallerClient=nil
					h.HubMutex.Unlock()
				}
			case <-h.timerCanceled:
				if logWantedFor("deadline") {
					fmt.Printf("setDeadline (%s) timerCanceled (secs=%d %v)\n",
						h.CalleeClient.calleeID, secs, timeStart.Format("2006-01-02 15:04:05"))
				}
				if h.timer!=nil {
					h.timer.Stop()
				}
				h.timer = nil
			}
		}()
	}
}

func (h *Hub) doBroadcast(message []byte) {
	// bad fktname! here we only send a message to BOTH clients
	// this fkt likes to be called with h.HubMutex (r)locked
	calleeID := ""
	if h.CalleeClient!=nil {
		calleeID = h.CalleeClient.calleeID
	}
	if h.CallerClient!=nil {
		if logWantedFor("______") { // was "deadline" had to be removed
			fmt.Printf("%s (%s) doBroadcast caller (%s) %s\n",
				h.CalleeClient.connType, calleeID, message, h.CallerClient.RemoteAddr)
		}
		h.CallerClient.Write(message)
	}
	if h.CalleeClient!=nil {
		if logWantedFor("______") { // was "deadline" had to be removed
			fmt.Printf("%s (%s) doBroadcast callee (%s) %s\n",
				h.CalleeClient.connType, calleeID, message, h.CalleeClient.RemoteAddr)
		}
		h.CalleeClient.Write(message)
	}
}

func (h *Hub) processTimeValues(comment string) {
	if h.lastCallStartTime>0 {
		h.CallDurationSecs = time.Now().Unix() - h.lastCallStartTime
		if logWantedFor("hub") {
			fmt.Printf("%s (%s) timeValues %s sec=%d %d %d\n",
				h.CalleeClient.connType, h.CalleeClient.calleeID, comment,
				h.CallDurationSecs, time.Now().Unix(), h.lastCallStartTime)
		}
		if h.CallDurationSecs>0 {
			numberOfCallsTodayMutex.Lock()
			numberOfCallsToday++
			numberOfCallSecondsToday += h.CallDurationSecs
			numberOfCallsTodayMutex.Unlock()
		}
	}
}

func (h *Hub) peerConHasEnded(cause string) {
	// the peerConnection has ended, either bc one side has sent "cancel"
	// or bc callee has unregistered or got ws-disconnected
	// peerConHasEnded MUST be called with locking in place
	// cause = "caller c"

	if h.CalleeClient==nil {
		//fmt.Printf("# peerConHasEnded but h.CalleeClient==nil\n")
		return
	}

	if logWantedFor("wsclose") {
		fmt.Printf("%s (%s) peerConHasEnded peercon=%v media=%v (%s)\n",
			h.CalleeClient.connType, h.CalleeClient.calleeID,
			h.CalleeClient.isConnectedToPeer.Load(), h.CalleeClient.isMediaConnectedToPeer.Load(), cause)
	}

	if h.lastCallStartTime>0 {
		h.processTimeValues("peerConHasEnded") // will set c.hub.CallDurationSecs
		h.lastCallStartTime = 0
	}

	callerID := h.CallerID
	callerName := ""
	//callerHost := ""
	if h.CallerClient!=nil  {	
		callerName = h.CallerClient.callerName
		//callerHost = c.hub.CallerClient.callerHost
	}

	// clear recentTurnCalleeIps[ipNoPort] entry (if this was a relay session)
	recentTurnCalleeIpMutex.Lock()
	delete(recentTurnCalleeIps,h.CallerIpNoPort)
	recentTurnCalleeIpMutex.Unlock()

	if h.CalleeClient.isConnectedToPeer.Load() {
		// we are disconnecting a peer connect
		localPeerCon := "?"
		remotePeerCon := "?"
		localPeerCon = "p2p"
		if !h.LocalP2p { localPeerCon = "relay" }
		remotePeerCon = "p2p"
		if !h.RemoteP2p { remotePeerCon = "relay" }

		h.CalleeClient.isConnectedToPeer.Store(false)
		h.CalleeClient.isMediaConnectedToPeer.Store(false)
		// now clear these two flags also on the other side
		if h.CallerClient!=nil {
			h.CallerClient.isConnectedToPeer.Store(false)
			h.CallerClient.isMediaConnectedToPeer.Store(false)
		}

		title := "PEER DISCON❌";
//		if h.CallDurationSecs > 0 {
//			title = "PEER DISCON📴"
//		}
		fmt.Printf("%s (%s) %s %ds %s/%s %s <- %s (%s) %s\n",
			h.CalleeClient.connType, h.CalleeClient.calleeID, title,
			h.CallDurationSecs, localPeerCon, remotePeerCon,
			h.CalleeClient.RemoteAddrNoPort, h.CallerIpNoPort, callerID, cause)
	}

	// add an entry to missed calls, but only if hub.CallDurationSecs<=0
	// if caller cancels via hangup button, then this is the only addMissedCall() and contains msgtext
	// undone: this is NOT a missed call if callee denies the call: !strings.HasPrefix(cause,"callee")
	//if h.CallDurationSecs<=0 /*&& !strings.HasPrefix(cause,"callee")*/ {
	if h.CallerClient!=nil && h.CallDurationSecs<=0 {
		// add missed call if dbUser.StoreMissedCalls is set
		userKey := h.CalleeClient.calleeID + "_" + strconv.FormatInt(int64(h.registrationStartTime),10)
		var dbUser DbUser
		err := kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# %s (%s) failed to get dbUser err=%v\n",
				h.CalleeClient.connType, h.CalleeClient.calleeID, err)
		} else if dbUser.StoreMissedCalls {
			//fmt.Printf("%s (%s) store missedCall dialID=(%s) msg=(%s)\n",
			//	h.CalleeClient.connType, h.CalleeClient.calleeID, h.CallerClient.dialID, h.CalleeClient.callerTextMsg)
			calleeIdDialed := ""
			if(h!=nil && h.CallerClient!=nil) {
				calleeIdDialed = h.CallerClient.dialID
			}
			addMissedCall(h.CalleeClient.calleeID, CallerInfo{h.CallerIpNoPort, callerName, time.Now().Unix(),
				callerID, calleeIdDialed, h.CalleeClient.callerTextMsg }, cause)
		}
	}

	h.CalleeClient.calleeInitReceived.Store(false) // accepting new init from callee now

	err := StoreCallerIpInHubMap(h.CalleeClient.globalCalleeID, "", false)
	if err!=nil {
		// err "key not found": callee has already signed off - can be ignored
		//if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# %s (%s) peerConHasEnded clr callerIp %s err=%v\n",
				h.CalleeClient.connType, h.CalleeClient.calleeID, h.CalleeClient.globalCalleeID, err)
		//}
	}

	// clear disconnect-timeout
	h.setDeadline(0,cause)	// may call peerConHasEnded again (we made sure this is no problem)
}

func (h *Hub) closeCaller(cause string) {
	h.HubMutex.Lock()
	if h.CallerClient!=nil {
		h.CallerClient.Close(cause)
		// this will prevent NO PEERCON after hangup or after calls shorter than 10s
		if logWantedFor("wsclose") {
			fmt.Printf("%s (%s) closeCaller\n", h.CalleeClient.connType, h.CalleeClient.calleeID)
		}
		h.CallerClient = nil
	}
	h.HubMutex.Unlock()
}

func (h *Hub) closePeerCon(cause string) {
	h.HubMutex.Lock()
	h.peerConHasEnded(cause)
	h.HubMutex.Unlock()

	h.closeCaller(cause)
}

func (h *Hub) closeCallee(cause string) {
	comment := "closeCallee <- "+cause
	h.HubMutex.Lock()
	if h.CalleeClient!=nil {
		if logWantedFor("wsclose") {
			fmt.Printf("%s (%s) closeCallee peercon=%v (%s)\n",
				h.CalleeClient.connType, h.CalleeClient.calleeID,
				h.CalleeClient.isConnectedToPeer.Load(), cause)
		}

		// NOTE: delete(hubMap,id) might have been executed, caused by timeout22s

		if h.lastCallStartTime>0 {
			h.processTimeValues(comment)
			h.lastCallStartTime = 0
		}

		if h.CalleeClient.isConnectedToPeer.Load() {
			// when callee's ws-connection ends, we do NOT want to close callee's p2p connection
			localPeerCon := "?"
			remotePeerCon := "?"
			localPeerCon = "p2p"
			if !h.LocalP2p { localPeerCon = "relay" }
			remotePeerCon = "p2p"
			if !h.RemoteP2p { remotePeerCon = "relay" }
			fmt.Printf("%s (%s) CALLEEGONE⭕ PEERCONT %ds %s/%s %s <- %s\n",
				h.CalleeClient.connType, h.CalleeClient.calleeID,
				h.CallDurationSecs, localPeerCon, remotePeerCon,
				h.CalleeClient.RemoteAddrNoPort, h.CallerIpNoPort)

			// h.peerConHasEnded(comment) // will set h.CallerClient=nil
		}
		h.LocalP2p = false
		h.RemoteP2p = false
		h.setDeadline(0,comment)

		h.CalleeClient.Close(comment)

		keepAliveMgr.Delete(h.CalleeClient.wsConn)
		h.CalleeClient.wsConn.SetReadDeadline(time.Time{})

		h.CalleeClient.isConnectedToPeer.Store(false)
		h.CalleeClient.isMediaConnectedToPeer.Store(false)
		h.CalleeClient.pickupSent.Store(false)

		h.CalleeClient = nil
		h.HubMutex.Unlock()

		// remove callee from hubMap; delete wsClientID from wsClientMap
		h.exitFunc(h.WsClientID,comment) // comment may be 'timeout22'
	} else {
		h.HubMutex.Unlock()
	}
	h.closeCaller(comment)
}

