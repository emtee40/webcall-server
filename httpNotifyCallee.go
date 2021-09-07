// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"net/http"
	"time"
	"strings"
	"fmt"
	"encoding/json"
	"io/ioutil"
	"sync"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
	"github.com/mehrvarz/webcall/twitter"
	"github.com/mrjones/oauth"
	webpush "github.com/SherClockHolmes/webpush-go"
)

var twitterClient *twitter.DesktopClient = nil
var twitterClientLock sync.RWMutex
var twitterAuthFailedCount = 0

func httpNotifyCallee(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, remoteAddrWithPort string) {
	// caller wants to wait for callee to come online to answer call
	if urlID == "" {
		fmt.Printf("# notifyCallee failed no urlID\n")
		// JS will tell caller: could not reach urlID
		return
	}

	// get callerId + callerName from url-args
	callerId := ""
	url_arg_array, ok := r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerId = url_arg_array[0]
	}
	callerName := ""
	url_arg_array, ok = r.URL.Query()["callerName"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerName = url_arg_array[0]
	}
	fmt.Printf("notifyCallee callerId=(%s) callerName=(%s)\n", callerId, callerName)
	if callerId != "" {
		addContact(urlID, callerId, callerName, "/notifyCallee")
	}

	var dbEntry skv.DbEntry
	err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
	if err != nil {
		fmt.Printf("# notifyCallee (%s) failed on dbRegisteredIDs\n", urlID)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
	var dbUser skv.DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# notifyCallee (%s) failed on dbUserBucket\n", urlID)
		return
	}
	if dbUser.PremiumLevel==0 {
		fmt.Printf("# notifyCallee urlID (%s) not a premium user\n", urlID)
		return
	}

	// check if callee is hidden online
	calleeIsHiddenOnline := false
	ejectOn1stFound := true
	reportHiddenCallee := true
	occupy := false
	globalID := ""
	if rtcdb == "" {
		var locHub *Hub
		globalID, locHub, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/notifyCallee")
		if globalID != "" && locHub.IsCalleeHidden {
			fmt.Printf("notifyCallee (%s) isHiddenOnline\n", urlID)
			calleeIsHiddenOnline = true
		}
	} else {
		var globHub *rkv.Hub
		globalID, globHub, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/notifyCallee")
		if err != nil {
			fmt.Printf("# /notifyCallee GetOnlineCallee() err=%v\n", err)
			return
		}
		if globalID != "" && globHub.IsCalleeHidden {
			fmt.Printf("notifyCallee (%s) isHiddenOnline\n", urlID)
			calleeIsHiddenOnline = true
		}
	}

	if globalID == "" {
		// callee (urlID) is really offline - send push notification(s)
		// NOTE: on Chromium/Mac this msg is cut off after "the phone." (with callerName="Dave")
		msg := "Caller " + callerName + " is waiting for you to pick up the phone." +
			" Please open your callee app now."
		notificationSent := false

		if dbUser.Str2 != "" {
			// web push device 1 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str2, msg, urlID)
			if err != nil {
				fmt.Printf("# notifyCallee (%s) webpush fail device1 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent = true
			} else if statusCode == 410 {
				fmt.Printf("# notifyCallee (%s) webpush fail device1 delete subscr\n", urlID)
				dbUser.Str2 = ""
			} else {
				fmt.Printf("# notifyCallee (%s) webpush fail device1 status=%d\n",
					urlID, statusCode)
			}
		}

		if dbUser.Str3 != "" {
			// web push device 2 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str3, msg, urlID)
			if err != nil {
				fmt.Printf("# notifyCallee (%s) webpush fail device2 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent = true
			} else if statusCode == 410 {
				fmt.Printf("# notifyCallee (%s) webpush fail device2 delete subscr\n", urlID)
				dbUser.Str3 = ""
			} else {
				fmt.Printf("# notifyCallee (%s) webpush fail device2 status=%d\n",
					urlID, statusCode)
			}
		}

		// notify urlID via twitter direct message
		// here we use twitter message (or twitter direct message) to send a notification
		if dbUser.Email2 != "" { // twitter handle
			twitterClientLock.Lock()
			if twitterClient == nil {
				twitterAuth()
			}
			twitterClientLock.Unlock()
			if twitterClient == nil {
				fmt.Printf("# notifyCallee (%s) failed no twitterClient\n", urlID)
				// script will tell caller: could not reach urlID
			} else {
				//_,err = twitterClient.SendDirect(dbUser.Email2, msg)
				if strings.HasPrefix(dbUser.Email2, "@") {
					msg = dbUser.Email2 + " " + msg
				} else {
					msg = "@" + dbUser.Email2 + " " + msg
				}
				// add german date and time + long random id to msg
				// TODO we should use the callee-specif time zone
				msg = msg + " " + operationalNow().Format("2006-01-02 15:04:05")
				respdata, err := twitterClient.SendTweet(msg)
				if err != nil {
					maxlen := 30
					if len(dbUser.Email2) < 30 {
						maxlen = len(dbUser.Email2)
					}
					fmt.Printf("# notifyCallee (%s/%s) SendDirect err=%v\n",
						urlID, dbUser.Email2[:maxlen], err)
					// script will tell caller: could not reach urlID
					// TODO: but if the err is caused by the callee entering a faulty tw_user_id
					//       how will this callee find out about the issue
				} else {
					tweet := twitter.TimelineTweet{}
					err = json.Unmarshal(respdata, &tweet)
					if err != nil {
						fmt.Printf("# SendTweet cannot parse respdata err=%v\n", err)
					} else {
						// twitter notification succesfully sent
						notificationSent = true
						maxlen := 30
						if len(dbUser.Email2) < 30 {
							maxlen = len(dbUser.Email2)
						}
						fmt.Printf("SendTweet OK (id=%s/twHandle=%s/tweetId=%s)\n",
							urlID, dbUser.Email2[:maxlen], tweet.IdStr)
						// in 1hr we want to delete this tweet via tweet.Id
						// so we store tweet.Id dbSentNotifTweets
						notifTweet := skv.NotifTweet{time.Now().Unix(), msg}
						err = kvNotif.Put(dbSentNotifTweets, tweet.IdStr, notifTweet, false)
						if err != nil {
							fmt.Printf("# notifyCallee (%s) failed to store dbSentNotifTweets\n",
								tweet.IdStr)
						}
					}
				}
			}
		}

		if !notificationSent {
			// we couldn't send any notifications: store call as missed call
			fmt.Printf("# notifyCallee (%s) no notification sent - store as missed call\n", urlID)
			caller := CallerInfo{remoteAddrWithPort, callerName, time.Now().Unix(), callerId}
			var missedCallsSlice []CallerInfo
			err := kvCalls.Get(dbMissedCalls, urlID, &missedCallsSlice)
			if err != nil {
				//fmt.Printf("# notifyCallee (%s) failed to read dbMissedCalls %v\n", urlID, err)
			}
			// make sure we never have more than 10 missed calls
			if missedCallsSlice != nil && len(missedCallsSlice) >= 10 {
				missedCallsSlice = missedCallsSlice[1:]
			}
			missedCallsSlice = append(missedCallsSlice, caller)
			err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, false)
			if err != nil {
				fmt.Printf("# notifyCallee (%s) failed to store dbMissedCalls %v\n", urlID, err)
			}

			// there is no need for the caller to wait, bc we could not send a push notification
			// by NOT responding "ok" we tell the caller that we were NOT able to reach the callee
			return
		}
	}

	// the following will "freeze" the caller until callee sends a value to the callers chan
	// waitingCallerChanMap[urlID] <- 1
	c := make(chan int)
	waitingCallerChanLock.Lock()
	waitingCallerChanMap[remoteAddrWithPort] = c
	waitingCallerChanLock.Unlock()

	waitingCaller := CallerInfo{remoteAddrWithPort, callerName, time.Now().Unix(), callerId}

	var waitingCallerSlice []CallerInfo
	err = kvCalls.Get(dbWaitingCaller, urlID, &waitingCallerSlice)
	if err != nil {
		//fmt.Printf("# notifyCallee (%s) failed to read dbWaitingCaller\n",urlID)
	}
	waitingCallerSlice = append(waitingCallerSlice, waitingCaller)
	err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
	if err != nil {
		fmt.Printf("# notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
	}

	hubMapMutex.RLock()
	cli := hubMap[globalID].CalleeClient
	hubMapMutex.RUnlock()

	if calleeIsHiddenOnline {
		// NEW:
		// callee can see a list of all waiting callers
		//   by listing the waitingCallerSlice in waitingForCalleeMap[urlID]
		// it can then wake a caller by sending: waitingCallerMap[waitingCallerSlice[].AddrPort] <- 1
		// we only need to figure out how we want to display the waitingCallerSlice
		// I think we push the list to callee when it connects
		//   and then we push it again everytime it changes

		// bc waitingForCalleeMap[urlID] has changed and bc callee is (hidden) online
		// we need to push the waitingCallerSlice to the callee now
		// notify callee directly (without twitter)
		// c.send <- []byte("msg|(statustext 'callerName calling' with two links pickup/reject)")
		// problem is: multiple such waiting calles can stack up; we need to offer the callee a list
		// we need to make it so that 'msg' shows up separately from statustext
		// and when a caller gives up, it's line will disappear from the callees list
		// keep the caller xhr standing until callee picks up

		// send an updated json to callee-client
		fmt.Printf("notifyCallee (%s) send waitingCallerSlice len=%d\n",
			urlID, len(waitingCallerSlice))
		json, err := json.Marshal(waitingCallerSlice)
		if err != nil {
			fmt.Printf("# notifyCallee json.Marshal(waitingCallerSlice) err=%v\n", err)
		} else {
			fmt.Printf("notifyCallee send waitingCallers (%s)\n", urlID)

			if cli != nil {
				cli.Write([]byte("waitingCallers|" + string(json)))
			}
		}
	}

	// let caller wait (let it's xhr stand) until callee picks up the call
	fmt.Printf("notifyCallee (%s) waiting for callee online notification\n", urlID)
	if cli != nil {
		cli.unHiddenForCaller = "" // TODO ???
	}
	callerGaveUp := false
	select {
	case <-c:
		// callee allows caller to connect
		// coming from callee.js: function pickupWaitingCaller(callerID)
		//             client.go: if cmd=="pickupWaitingCaller"

		// callee may have gone offline (and back online) in the mean time
		// so it only helps if we retrieve hubclient before we set unHiddenForCaller

		var locHub *Hub
		var globHub *rkv.Hub
		urlID := ""
		if rtcdb == "" {
			urlID, locHub, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
				remoteAddr, occupy, "/notifyCallee")
		} else {
			urlID, globHub, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
				remoteAddr, occupy, "/notifyCallee")
			if err != nil {
				fmt.Printf("# /notifyCallee GetOnlineCallee() err=%v\n", err)
				return
			}
		}

		if urlID != "" {
			fmt.Printf("/notifyCallee callee (%s) wants caller (%s) to connect (%s)\n",
				urlID, remoteAddr, cli.unHiddenForCaller)
			// this will make the hidden callee "visible" for the caller
			cli.unHiddenForCaller = remoteAddr
			if locHub != nil { // TODO or if rtcdb!=""
				locHub.IsUnHiddenForCallerAddr = remoteAddr
				if err := SetUnHiddenForCaller(urlID, remoteAddr); err != nil {
					fmt.Printf("# /notifyCallee SetUnHiddenForCaller id=%s ip=%s err=%v\n",
						urlID, remoteAddr, err)
				}
			} else {
				globHub.IsUnHiddenForCallerAddr = remoteAddr
				if err := rkv.SetUnHiddenForCaller(urlID, remoteAddr); err != nil {
					fmt.Printf("# /notifyCallee SetUnHiddenForCaller id=%s ip=%s err=%v\n",
						urlID, remoteAddr, err)
				}
			}

			hubMapMutex.RLock()
			cli = hubMap[urlID].CalleeClient
			hubMapMutex.RUnlock()
		} else {
			fmt.Printf("# /notifyCallee callee (%s) wants caller (%s) to connect - hubclient==nil\n",
				urlID, remoteAddr)
			cli = nil
		}
		// caller receiving this "ok" will automatically attempt to make a call now
		fmt.Fprintf(w, "ok")
	case <-r.Context().Done():
		// caller has disconnected (before callee could wake this channel to answer the call)
		fmt.Printf("/notifyCallee (%s) caller disconnected\n", urlID)
		callerGaveUp = true

		// callee may have gone offline in the mean time - and may be back online now
		// so it only helps if we retrieve hubclient before we hubclient.send below

		urlID := ""
		if rtcdb == "" {
			urlID, _, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
				remoteAddr, occupy, "/notifyCallee")
		} else {
			urlID, _, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
				remoteAddr, occupy, "/notifyCallee3")
			if err != nil {
				fmt.Printf("# /notifyCallee GetOnlineCallee() id=%s err=%v\n", urlID, err)
			}
		}

		if urlID != "" {
			hubMapMutex.RLock()
			cli = hubMap[urlID].CalleeClient
			hubMapMutex.RUnlock()
		} else {
			cli = nil
		}
	}

	fmt.Printf("notifyCallee (%s) delete callee online-notification chan\n", urlID)
	waitingCallerChanLock.Lock()
	delete(waitingCallerChanMap, remoteAddrWithPort)
	waitingCallerChanLock.Unlock()

	var missedCallsSlice []CallerInfo

	// remove this caller from waitingCallerSlice
	for idx := range waitingCallerSlice {
		if waitingCallerSlice[idx].AddrPort == remoteAddrWithPort {
			fmt.Printf("notifyCallee (%s) remove caller from waitingCallerSlice + store\n", urlID)
			waitingCallerSlice = append(waitingCallerSlice[:idx], waitingCallerSlice[idx+1:]...)
			err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
			if err != nil {
				fmt.Printf("# notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
			}

			if callerGaveUp {
				// store missed call
				fmt.Printf("notifyCallee (%s) store missed call\n", urlID)
				err = kvCalls.Get(dbMissedCalls, urlID, &missedCallsSlice)
				if err != nil {
					fmt.Printf("# notifyCallee (%s) failed to read dbMissedCalls %v\n", urlID, err)
				}
				// make sure we never have more than 10 missed calls
				if missedCallsSlice != nil && len(missedCallsSlice) >= 10 {
					missedCallsSlice = missedCallsSlice[1:]
				}
				missedCallsSlice = append(missedCallsSlice, waitingCaller)
				err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, false)
				if err != nil {
					fmt.Printf("# notifyCallee (%s) failed to store dbMissedCalls %v\n", urlID, err)
				}
			}
			break
		}
	}

	if cli != nil {
		if dbUser.PremiumLevel >= 1 {
			// premium callee is online: send updated waitingCallerSlice + missedCalls
			waitingCallerToCallee(urlID, waitingCallerSlice, missedCallsSlice, cli)
		}
	} else {
		fmt.Printf("# notifyCallee (%s) cli==nil\n", urlID)
	}
	return
}

func httpCanbenotified(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, remoteAddrWithPort string) {
	// checks if urlID can be notified of an incoming call
	// either directly (while callee is hidden online) or via twitter
	if urlID=="" {
		fmt.Printf("# /canbenotified failed on empty urlID rip=%s\n",remoteAddr)
		return
	}

	var dbEntry skv.DbEntry
	var dbUser skv.DbUser
	err := kvMain.Get(dbRegisteredIDs,urlID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /canbenotified (%s) failed on dbRegisteredIDs rip=%s\n",urlID,remoteAddr)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /canbenotified (%s) failed on dbUserBucket rip=%s\n",urlID,remoteAddr)
		return
	}
	calleeName := dbUser.Name
	if dbUser.PremiumLevel==0 {
		fmt.Printf("/canbenotified urlID=(%s) is no premium user rip=%s\n",urlID,remoteAddr)
		return
	}

	// urlID is a paying user
	// remoteAddrWithPort of incoming call
	caller := CallerInfo{remoteAddrWithPort,"unknown",time.Now().Unix(),""}

	// check if hidden online, if so skip pushable check
	ejectOn1stFound := true
	reportHiddenCallee := true
	occupy := false
	var globHub *rkv.Hub
	var locHub *Hub
	key := ""
	if rtcdb=="" {
		key, locHub, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/canbenotified")
		if key!="" && locHub.IsCalleeHidden {
			fmt.Printf("/canbenotified (%s) isHiddenOnline rip=%s\n",urlID,remoteAddr)
			return
		}
	} else {
		key, globHub, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/canbenotified");
		if err!=nil {
			fmt.Printf("# /canbenotified GetOnlineCallee() err=%v\n",err)
			return
		}
		if key!="" && globHub.IsCalleeHidden {
			fmt.Printf("/canbenotified (%s) isHiddenOnline rip=%s\n",urlID,remoteAddr)
			return
		}
	}
	if dbUser.Email2=="" && dbUser.Str2=="" && dbUser.Str3=="" {
		// this user can NOT rcv push msg (not pushable)
		fmt.Printf("# /canbenotified (%s) has no push channel rip=%s\n",urlID,remoteAddr)
		// store missed call
		var missedCallsSlice []CallerInfo
		err := kvCalls.Get(dbMissedCalls,urlID,&missedCallsSlice)
		if err!=nil {
			fmt.Printf("# /canbenotified (%s) failed to read dbMissedCalls err=%v rip=%s\n",
				urlID, err, remoteAddr)
		}
		// make sure we never show more than 10 missed calls
		if missedCallsSlice!=nil && len(missedCallsSlice)>=10 {
			missedCallsSlice = missedCallsSlice[1:]
		}
		missedCallsSlice = append(missedCallsSlice, caller)
		err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, true) // skipConfirm
		if err!=nil {
			fmt.Printf("# /canbenotified (%s) failed to store dbMissedCalls err=%v rip=%s\n",
				urlID, err, remoteAddr)
		}
		return
	}

	// yes, urlID can be notified
	// problem is that we don't get any event if the caller gives up at this point (TODO still true?)
	fmt.Printf("/canbenotified urlID=(%s) return (ok|%s) rip=%s\n",urlID,calleeName,remoteAddr)
	fmt.Fprintf(w,"ok|"+calleeName)
	return
}

func addContact(calleeID string, callerID string, callerName string, comment string) error {
	if strings.HasPrefix(calleeID,"answie") {
		return nil
	}
	if calleeID == callerID {
		return nil
	}
	if strings.HasPrefix(calleeID,"!") {
		return nil
	}
	if strings.HasPrefix(callerID,"!") {
		return nil
	}

	callerInfoMap := make(map[string]string) // callerID -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		//fmt.Printf("# addContact get key=%s err=%v (ignored)\n", calleeID, err)
		//can be ignored: return err // key not found (empty)
	}
	oldName,ok := callerInfoMap[callerID]
	if ok && oldName!="" {
		//fmt.Printf("# addContact store key=%s callerID=%s EXISTS(%s) newname=%s comment=%s\n",
		//	calleeID, callerID, oldName, callerName, comment)
		return nil
	}
	callerInfoMap[callerID] = callerName
	err = kvContacts.Put(dbContactsBucket, calleeID, callerInfoMap, true)
	if err!=nil {
		fmt.Printf("# addContact store key=%s err=%v\n", calleeID, err)
		return err
	}
	//fmt.Printf("addContact stored for id=%s callerID=%s name=%s comment=%s\n",
	//	calleeID, callerID, callerName, comment)
	return nil
}

func webpushSend(subscription string, msg string, urlID string) (error,int) {
	// Decode subscription
	s := &webpush.Subscription{}
	json.Unmarshal([]byte(subscription), s)
	//fmt.Printf("unmarshalled subscription (%v)\n",s)

	// Send Notification
	readConfigLock.RLock()
	httpResponse, err := webpush.SendNotification([]byte(msg), s, &webpush.Options{
		Subscriber:      adminEmail, // Do not use "mailto:"
		VAPIDPublicKey:  vapidPublicKey,
		VAPIDPrivateKey: vapidPrivateKey,
		TTL:             60,
	})
	readConfigLock.RUnlock()
	if err != nil {
		maxlen:=30; if len(subscription)<30 { maxlen=len(subscription) }
		fmt.Printf("# webpush.SendNotif err=%v (id=%s) (%s)\n",
			urlID, err, subscription[:maxlen])
		return err, 0
	}
	// httpResponse.StatusCode should be 201
	fmt.Printf("webpush.SendNotif OK (id=%s) (httpRespCode=%v)\n",	urlID, httpResponse.StatusCode)
	httpResponse.Body.Close()
	return err, httpResponse.StatusCode
}

func twitterAuth() {
	// twitterClientLock must be managed outside
	if twitterAuthFailedCount>3 {
		return
	}
	readConfigLock.RLock()
	mytwitterKey := twitterKey
	mytwitterSecret := twitterSecret
	readConfigLock.RUnlock()
	if mytwitterKey=="" || mytwitterSecret=="" {
		return
	}

	twitterClient = twitter.NewDesktopClient(mytwitterKey, mytwitterSecret)
	basepath := "."
	accessTokenFile := basepath+"/accessToken.txt"
	b, err := ioutil.ReadFile(accessTokenFile)
	if err != nil {
		fmt.Printf("# twitter auth cannot read accessTokenFile=%s\n", accessTokenFile)
		twitterClient = nil
	} else {
		fmt.Printf("twitter auth using accessToken.txt (%s)\n",accessTokenFile)
		str := string(b)
		linetokens := strings.SplitN(str, "\n", 4)
		//log.Println("linetokens[0]="+linetokens[0])
		//log.Println("linetokens[1]="+linetokens[1])
		fmt.Printf("twitter auth linetokens[2]=%s\n", linetokens[2])
		//log.Println("linetokens[3]="+linetokens[3])
		var accessToken oauth.AccessToken
		accessToken.Token = linetokens[0]
		accessToken.Secret = linetokens[1]
		accessToken.AdditionalData = make(map[string]string)
		accessToken.AdditionalData["screen_name"] = linetokens[2]
		accessToken.AdditionalData["user_id"] = linetokens[3]
		accessTokenPtr, err := twitterClient.DoAuth(&accessToken)
		fmt.Printf("twitter auth accessToken=%v err=%v\n", accessTokenPtr, err)
		if err != nil {
			fmt.Printf("# twitter auth failed err=%v\n", err)
			twitterClient = nil
			twitterAuthFailedCount++
		} else {
			fmt.Printf("twitter auth success\n")
		}
	}
}

