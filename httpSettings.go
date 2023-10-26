// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// These methods enable callees to read and modify their 
// callee specific settings and contacts.
//
// httpGetSettings() is called via XHR "/rtcsig/getsettings".
// httpSetSettings() is called via XHR "/rtcsig/setsettings".
// httpGetContacts() is called via XHR "/rtcsig/getcontacts".
// httpSetContact() is called via XHR "/rtcsig/setcontact".
// httpDeleteContact() is called via XHR "/rtcsig/deletecontact".

package main

import (
	"net/http"
	"fmt"
	"encoding/json"
	"io"
	"strconv"
	"strings"
)

func httpGetSettings(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if cookie==nil {
		// no settings without a cookie (but not worth logging)
		//fmt.Printf("# /getsettings fail calleeID(%s) cookie==nil rip=%s\n", calleeID, remoteAddr)
		return
	}
	if calleeID=="" {
		fmt.Printf("# /getsettings fail no calleeID %s\n", remoteAddr)
		return
	}

	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && calleeID!=urlID {
		// this happens bc someone with calleeID in the cookie is now trying to use urlID via url
		fmt.Printf("# /getsettings urlID(%s) != calleeID(%s) %s ua=%s\n",
			urlID, calleeID, remoteAddr, r.UserAgent())
		return
	}

	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /getsettings (%s) fail on dbRegisteredIDs %s\n", calleeID, remoteAddr)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /getsettings (%s) fail on dbUserBucket %s\n", calleeID, remoteAddr)
		return
	}

	if logWantedFor("getsettings") {
		fmt.Printf("/getsettings (%s) %s ua=%s\n", calleeID, remoteAddr, r.UserAgent())
	}
	var reqBody []byte
	readConfigLock.RLock() // for vapidPublicKey
	reqBody, err = json.Marshal(map[string]string{
		"nickname": dbUser.Name,
		"mastodonID": dbUser.MastodonID,
		"tootOnCall": strconv.FormatBool(dbUser.MastodonSendTootOnCall),
		"askCallerBeforeNotify": strconv.FormatBool(dbUser.AskCallerBeforeNotify),
		"storeContacts": strconv.FormatBool(dbUser.StoreContacts),
		"storeMissedCalls": strconv.FormatBool(dbUser.StoreMissedCalls),
		"dialSoundsMuted": strconv.FormatBool(bool(dbUser.Int2&4==4)),
		"mainLinkDeactive": strconv.FormatBool(bool(dbUser.Int2&8==8)),
		"mastodonLinkDeactive": strconv.FormatBool(bool(dbUser.Int2&16==16)),
//		"webPushSubscription1": dbUser.Str2,
//		"webPushUA1": dbUser.Str2ua,
//		"webPushSubscription2": dbUser.Str3,
//		"webPushUA2": dbUser.Str3ua,
//		"vapidPublicKey": vapidPublicKey,
		"dialSounds": strconv.FormatBool(!(dbUser.Int2&4==4)), // bit4 set for mute (bit4 clear = play dialsounds)
		"serverVersion": codetag,
	})

	readConfigLock.RUnlock()
	if err != nil {
		fmt.Printf("# /getsettings (%s) fail on json.Marshal %s\n", calleeID, remoteAddr)
		return
	}
	if logWantedFor("getsettings") {
		fmt.Printf("/getsettings (%s) done [%s]\n",calleeID,reqBody)
	}
	fmt.Fprintf(w,string(reqBody))
	return
}

func httpSetSettings(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /setsettings fail no calleeID %s\n", remoteAddr)
		return
	}
	if cookie==nil {
		fmt.Printf("# /setsettings (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, could be a user trying to run more than one callee in the same browser
	if urlID!="" && calleeID!=urlID {
		fmt.Printf("# /setsettings fail calleeID(%s) != urlID(%s) %s\n", calleeID, urlID, remoteAddr)
		return
	}

	// get json response via post to store settings for calleeID (from cookie)
	data := ""
	postBuf := make([]byte, 2000)
	length,_ := io.ReadFull(r.Body, postBuf)
	if length>0 {
		data = string(postBuf[:length])
	}
	if data=="" {
		fmt.Printf("# /setsettings (%s) failed on io.ReadFull body %d %s\n",calleeID, length, remoteAddr)
		return
	}

	var newSettingsMap map[string]string
	err := json.Unmarshal([]byte(data), &newSettingsMap)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on json.Unmarshal (%v) %s err=%v\n",
			calleeID, data, remoteAddr, err)
		// decoding issue in r.Body: any changes will be lost
		return
	}

	var dbEntry DbEntry
	err = kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on get dbRegisteredIDs dbEntry %s\n", calleeID, remoteAddr)
		// any changes will be lost
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on get dbUserBucket dbUser key=%s %s\n", calleeID, dbUserKey, remoteAddr)
		// any changes will be lost
		return
	}

	if logWantedFor("setsettings") {
		fmt.Printf("/setsettings (%s) len=%d rip=%s %v\n", calleeID, len(data), remoteAddr, newSettingsMap)
	}
	for key,val := range newSettingsMap {
		switch(key) {
		case "nickname":
			if val != dbUser.Name {
				if logWantedFor("setsettings") {
					fmt.Printf("/setsettings (%s) nickname (%s) (old:%s) %s\n",calleeID,val,dbUser.Name,remoteAddr)
				}
				dbUser.Name = val
			}
		case "mastodonID":
			if val != dbUser.MastodonID {
				if logWantedFor("setsettings") {
					fmt.Printf("/setsettings (%s) mastodonID (%s) (old:%s) %s\n",
						calleeID,val,dbUser.MastodonID,remoteAddr)
				}
				dbUser.MastodonID = val
			}
		case "tootOnCall":
			if(val=="true") {
				if dbUser.MastodonSendTootOnCall != true {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) tootOnCall (%s) (old:%v) %s\n",
							calleeID, val, dbUser.MastodonSendTootOnCall, remoteAddr)
					}
					dbUser.MastodonSendTootOnCall = true
				}
			} else {
				if dbUser.MastodonSendTootOnCall != false {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) tootOnCall (%s) (old:%v) %s\n",
							calleeID, val, dbUser.MastodonSendTootOnCall, remoteAddr)
					}
					dbUser.MastodonSendTootOnCall = false
				}
			}
		case "askCallerBeforeNotify":
			if(val=="true") {
				if dbUser.AskCallerBeforeNotify != true {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) askCallerBeforeNotify (%s) (old:%v) %s\n",
							calleeID, val, dbUser.AskCallerBeforeNotify, remoteAddr)
					}
					dbUser.AskCallerBeforeNotify = true
				}
			} else {
				if dbUser.AskCallerBeforeNotify != false {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) askCallerBeforeNotify (%s) (old:%v) %s\n",
							calleeID, val, dbUser.AskCallerBeforeNotify, remoteAddr)
					}
					dbUser.AskCallerBeforeNotify = false
				}
			}
		case "storeContacts":
			if(val=="true") {
				if dbUser.StoreContacts != true {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) storeContacts (%s) (old:%v) %s\n",
							calleeID, val, dbUser.StoreContacts, remoteAddr)
					}
					dbUser.StoreContacts = true
				}
			} else {
				if dbUser.StoreContacts != false {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) storeContacts (%s) (old:%v) %s\n",
							calleeID, val, dbUser.StoreContacts, remoteAddr)
					}
					dbUser.StoreContacts = false
				}
			}
		case "storeMissedCalls":
			if(val=="true") {
				if !dbUser.StoreMissedCalls {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) storeMissedCalls (%s) old:%v\n",
							calleeID,val,dbUser.StoreMissedCalls)
					}
					dbUser.StoreMissedCalls = true
					// show missedCalls on callee web client (if avail)
					hubMapMutex.RLock()
					hub := hubMap[calleeID]
					hubMapMutex.RUnlock()
					if hub!=nil && hub.CalleeClient!=nil {
						var callsWhileInAbsence []CallerInfo
						err := kvCalls.Get(dbMissedCalls,calleeID,&callsWhileInAbsence)
						if err!=nil {
							// "key not found" is here NOT an error
							if strings.Index(err.Error(),"key not found")<0 {
								fmt.Printf("# /setsettings (%s) storeMissedCalls kvCalls.Get fail err=%v\n",
									calleeID, err)
							}
						} else {
							json, err := json.Marshal(callsWhileInAbsence)
							if err != nil {
								fmt.Printf("# /setsettings (%s) storeMissedCalls json.Marshal fail err=%v\n",
									calleeID, err)
							} else {
								hub.CalleeClient.Write([]byte("missedCalls|"+string(json)))
							}
						}
					}
				}
			} else {
				if dbUser.StoreMissedCalls {
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) storeMissedCalls (%s) old:%v %s\n",
							calleeID, val, dbUser.StoreMissedCalls, remoteAddr)
					}
					dbUser.StoreMissedCalls = false
					// hide missedCalls on callee web client
					hubMapMutex.RLock()
					hub := hubMap[calleeID]
					hubMapMutex.RUnlock()
					if hub!=nil && hub.CalleeClient!=nil {
						hub.CalleeClient.Write([]byte("missedCalls|")) // websocket required
					}
				}
			}

		case "dialSoundsMuted":
			if val=="true" {
				if dbUser.Int2 & 4 == 0 {
					// set dialsounds off (muted)
					dbUser.Int2 |= 4
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) dialSoundsMuted (%s) %d %s\n",
							calleeID, val, dbUser.Int2&4, remoteAddr)
					}
				}
			} else {
				if dbUser.Int2 & 4 == 4 {
					// set dialsounds on (not muted)
					dbUser.Int2 &= ^4
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) dialSoundsMuted (%s) %d %s\n",
							calleeID, val, dbUser.Int2&4, remoteAddr)
					}
				}
			}

		case "mainLinkDeactive":
			if val=="true" {
				if dbUser.Int2 & 8 == 0 {
					// set mainLink off (deactive)
					dbUser.Int2 |= 8
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) mainLinkDeactive (%s) %d %s\n",
							calleeID, val, dbUser.Int2&8, remoteAddr)
					}
				}
			} else {
				if dbUser.Int2 & 8 == 8 {
					// set mainLink on
					dbUser.Int2 &= ^8
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) mainLinkDeactive (%s) %d %s\n",
							calleeID, val, dbUser.Int2&8, remoteAddr)
					}
				}
			}

		case "mastodonLinkDeactive":
			if(val=="true") {
				if dbUser.Int2 & 16 == 0 {
					// set mainLink off (deactive)
					dbUser.Int2 |= 16
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) mainLinkDeactive (%s) %d %s\n",
							calleeID, val, dbUser.Int2&16, remoteAddr)
					}
				}
			} else {
				if dbUser.Int2 & 16 == 16 {
					// set mainLink on
					dbUser.Int2 &= ^16
					if logWantedFor("setsettings") {
						fmt.Printf("/setsettings (%s) mainLinkDeactive (%s) %d %s\n",
							calleeID, val, dbUser.Int2&16, remoteAddr)
					}
				}
			}

/*
		case "webPushSubscription1":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushSubscription1 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str2 {
				fmt.Printf("/setsettings (%s) new webPushSubscription1 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str2)
				if dbUser.Str2 != newVal {
					dbUser.Str2 = newVal
					if newVal!="" {
						// send welcome/verification push-msg
						msg := "You will from now on receive a WebPush notification for every call"+
								" you receive while not being connected to the WebCall server."
						err,statusCode := webpushSend(dbUser.Str2,msg,calleeID)
						if err!=nil {
							fmt.Printf("# setsettings (%s) webpush fail device1 err=%v\n",calleeID,err)
						} else if statusCode==201 {
							// success
						} else if statusCode==410 {
							fmt.Printf("# setsettings (%s) webpush fail device1 delete subscr\n",
								calleeID)
							dbUser.Str2 = ""
						} else {
							fmt.Printf("# setsettings (%s) webpush fail device1 status=%d\n",
								calleeID, statusCode)
						}
					}
				}
			}

		case "webPushUA1":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushUA1 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str2ua {
				fmt.Printf("/setsettings (%s) new webPushUA1 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str2ua)
				dbUser.Str2ua = newVal
			}

		case "webPushSubscription2":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushSubscription2 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str3 {
				fmt.Printf("/setsettings (%s) new webPushSubscription2 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str3)
				if dbUser.Str3 != newVal {
					dbUser.Str3 = newVal
					if newVal!="" {
						// send welcome/verification push-msg
						msg := "You will from now on receive a WebPush notification for every call"+
								" you receive while not being connected to the WebCall server."
						err,statusCode := webpushSend(dbUser.Str3,msg,calleeID)
						if err!=nil {
							fmt.Printf("# /setsettings (%s) webpush fail device2 err=%v\n",calleeID,err)
						} else if statusCode==201 {
							// success
						} else if statusCode==410 {
							fmt.Printf("# /setsettings (%s) webpush fail device2 delete subscr\n",
								calleeID)
							dbUser.Str3 = ""
						} else {
							fmt.Printf("# /setsettings (%s) webpush fail device2 status=%d\n",
								calleeID, statusCode)
						}
					}
				}
			}

		case "webPushUA2":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushUA2 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str3ua {
				fmt.Printf("/setsettings (%s) new webPushUA2 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str3ua)
				dbUser.Str3ua = newVal
			}
*/
		}
	}

	// store data
	err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) store db=%s bucket=%s %s err=%v\n",
			calleeID, dbMainName, dbUserBucket, remoteAddr, err)
	} else {
		//fmt.Printf("/setsettings (%s) stored db=%s bucket=%s\n", calleeID, dbMainName, dbUserBucket)
	}
	return
}

func httpGetContacts(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /getcontacts calleeID empty urlID=%s %s\n",urlID, remoteAddr)
		return
	}
	if cookie==nil {
		fmt.Printf("# /getcontacts (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}

	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /getcontacts urlID=%s != calleeID=%s %s\n",urlID,calleeID, remoteAddr)
		return
	}
	var idNameMap map[string]string // callerID(@host) -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&idNameMap)
	if err!=nil {
		fmt.Printf("# /getcontacts db get calleeID=%s %s err=%v\n", calleeID, remoteAddr, err)
		return
	}
	jsonStr, err := json.Marshal(idNameMap)
	if err != nil {
		fmt.Printf("# /getcontacts (%s) failed on json.Marshal %s err=%v\n", calleeID, remoteAddr, err)
		return
	}
	if logWantedFor("contacts") {
		fmt.Printf("/getcontacts (%s) send %d elements %s\n", calleeID, len(idNameMap), remoteAddr)
	}
	fmt.Fprintf(w,string(jsonStr))
	return
}


func httpGetContact(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /getcontact calleeID empty urlID=%s %s\n",urlID, remoteAddr)
		return
	}
	if cookie==nil {
		fmt.Printf("# /getcontact (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /getcontact urlID=%s != calleeID=%s %s\n",urlID,calleeID, remoteAddr)
		return
	}

	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID := url_arg_array[0]

		// cut off @hostname from contactID if host starts with hostname of local server
		idxAt := strings.Index(contactID,"@"+hostname)
		if idxAt >=0 {
			contactID = contactID[:idxAt]
		}
		if(contactID=="@") {
			contactID = ""
		}
		if contactID=="" || strings.HasPrefix(contactID,"@") {
			// this contactID is an incognito user
			if logWantedFor("contacts") {
				fmt.Printf("/getcontact (%s) empty id=(%s)\n", calleeID, contactID)
			}
			return
		}
		//fmt.Printf("! getcontact (%s) contactID=(%s)\n", calleeID, contactID)

		var idNameMap map[string]string // callerID(@host) -> name
		err := kvContacts.Get(dbContactsBucket,calleeID,&idNameMap)
		if err!=nil {
			fmt.Printf("# /getcontact (%s) db get %s err=%v\n", calleeID, remoteAddr, err)
			return
		}

		compoundName := idNameMap[contactID]
		if compoundName=="" {
			//fmt.Printf("/getcontact (%s) id=%s not found rip=%s\n", calleeID, contactID, remoteAddr)
			return
		}

		if logWantedFor("contacts") {
			fmt.Printf("/getcontact (%s) id=%s found=%s rip=%s\n", calleeID, contactID, compoundName, remoteAddr)
		}
		fmt.Fprintf(w,compoundName)
	}
	return
}

func httpSetContact(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// store contactID with name into contacts of calleeID
	// httpSetContact does not report errors back to the client (only logs them)
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /setcontact urlID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /setcontact (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}

	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /setcontact urlID=%s != calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}
	if strings.HasPrefix(calleeID,"answie") || strings.HasPrefix(calleeID,"talkback") {
		return
	}

	contactID := ""		// may or may not have @host attached
	compoundName := ""

	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID = url_arg_array[0]
	}
	if contactID=="" {
		if logWantedFor("contacts") {
			fmt.Printf("/setcontact (%s) contactID from client is empty %s\n", calleeID, remoteAddr)
		}
		return
	}

	forceChangeName := false
	_, ok = r.URL.Query()["force"]
	if ok {
		forceChangeName = true
		// setContact() will allow changing contactName (this is for contacts app only)
		// caller.js will NOT set this flag and will not be able to overwrite contactName
		if logWantedFor("contacts") {
			fmt.Printf("/setcontact (%s) forceChangeName set\n", calleeID)
		}
	}

	if r.Method=="POST" {
		// TODO implement delivery of contactID and compoundName via post body

	} else {
		// compoundName as format: name|prefCallbackId|ourNickname
		url_arg_array, ok = r.URL.Query()["name"]
		if ok && len(url_arg_array[0]) >= 1 {
			compoundName = url_arg_array[0]
		}
	}

	//fmt.Printf("/setcontact (%s) -> setcontact(%s,%s) \n", calleeID, contactID, compoundName)
	if !setContact(calleeID, contactID, compoundName, forceChangeName, remoteAddr, "http") {
		// the entry could not be stored or an error has occured
	}
}

func setContact(calleeID string, contactID string, compoundName string, changeName bool, remoteAddr string, comment string) bool {
	// calleeID = the callee for which to add a contact (always on this server instalce)
	// contactID = the userid to be added / changed (may/should contain @addr)
	// compoundName = contactName+"|"+callerId+"|"+callerName
	// contactName must split compoundName
	if strings.HasPrefix(calleeID,"answie") || strings.HasPrefix(calleeID,"talkback") {
		return true
	}

	fmt.Printf("setcontact (%s) <- contactID=%s compoundName=%s\n", calleeID, contactID, compoundName)
	contactName := "";
	callerID := "";
	callerName := "";
	tokenSlice := strings.Split(compoundName, "|")
	for idx, tok := range tokenSlice {
		switch idx {
			case 0: contactName = tok
			case 1: callerID = tok
			case 2: callerName = tok
		}
	}
	//fmt.Printf("setcontact (%s) compoundName=%s contactName=%s comment=%s\n",
	//	calleeID, compoundName, contactName, comment)

	// if dbUser.StoreContacts==false (not checked), just return true
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# setcontact (%s) fail on dbRegisteredIDs %s\n", calleeID, remoteAddr)
		return false
	}
	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# setcontact (%s) fail on dbUserBucket %s\n", calleeID, remoteAddr)
		return false
	}
	if !dbUser.StoreContacts {
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) !StoreContacts %s\n", calleeID, remoteAddr)
		}
		return true
	}

	// cut off @host from contactID if host starts with hostname of local server
	contactIDnohost := contactID
	idxAt := strings.Index(contactIDnohost,"@"+hostname)
	if idxAt >= 0 {
		contactIDnohost = contactIDnohost[:idxAt]
	}
	if strings.HasSuffix(contactIDnohost,"@") {
		//fmt.Printf("! setcontact (%s) hasSuffix @ contactIDnohost=(%s)\n", calleeID, contactIDnohost)
		contactIDnohost = contactIDnohost[0:len(contactIDnohost)-1]
	}
	if contactIDnohost=="" || strings.HasPrefix(contactIDnohost,"@") {
		// this contactID is an incognito user
		fmt.Printf("# setcontact (%s) abort on empty contactID %s\n", calleeID, remoteAddr)
		return false
	}
	//fmt.Printf("! setcontact (%s) contactID=(%s)\n", calleeID, contactID)

	// read the complete contacts for calleeID into idNameMap
	var idNameMap map[string]string // calleeID -> contactName
	err = kvContacts.Get(dbContactsBucket,calleeID,&idNameMap)
	if err!=nil {
		if(strings.Index(err.Error(),"key not found")<0) {
			fmt.Printf("# setcontact db get calleeID=%s %s err=%v\n", calleeID, remoteAddr, err)
			return false
		}
		// "key not found" is just an empty contacts list
		if logWantedFor("contacts") {
			fmt.Printf("setcontact creating new contacts map %s\n", remoteAddr)
		}
		idNameMap = make(map[string]string)
	}

	// check for contactID
	oldCompoundName,ok := idNameMap[contactID]
	if !ok || oldCompoundName=="" {
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) contactID=(%s) not found oldCompoundName=%s\n",
				calleeID, contactID, oldCompoundName)
		}
		// try lowercase contactID
		contactID = strings.ToLower(contactID)
		oldCompoundName,ok = idNameMap[contactID]
	}
	if !ok {
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) contactID=(%s)lowercase not found2 oldCompoundName=%s\n",
				calleeID, contactID, oldCompoundName)
		}
		// check for uppercase contactID
		toUpperContactID := strings.ToUpper(contactID[0:1])+contactID[1:]
		oldCompoundName,ok = idNameMap[toUpperContactID]
		if ok {
			contactID = toUpperContactID
		}
	}

	if !ok {
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) contactID=(%s) not found\n",
				calleeID, contactID)
		}
	} else {
		// found an entry for contactID
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) contactID=(%s) found oldCompoundName=%s\n",
				calleeID, contactID, oldCompoundName)
		}
		oldName := ""
		oldCallerID := "";
		oldCallerName := "";
		tokenSlice = strings.Split(oldCompoundName, "|")
		for idx, tok := range tokenSlice {
			switch idx {
				case 0: oldName = tok
				case 1: oldCallerID = tok
				case 2: oldCallerName = tok
			}
		}
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) oldCompoundName=%s oldName=%s\n", calleeID, oldCompoundName, oldName)
		}

		if oldName!="" && oldName!="unknown" {
			// a real oldName exists, so contactName (if it exits) would change it
			// this is only allowed if changeName flag is set
			if contactName=="" || !changeName {
				contactName = oldName
			}
		}

		if callerID=="" && oldCallerID!="" {
			callerID = oldCallerID
		}

		if callerName=="" && oldCallerName!="" {
			callerName = oldCallerName
		}
	}

	if contactName=="" {
		// wsClient.go ignores contactName if set to "unknown"
		contactName = "unknown"
	}

	newCompoundName := contactName+"|"+callerID+"|"+callerName
	if newCompoundName == oldCompoundName {
		// contactName for contactID exists and is same as oldName - don't overwrite
		if logWantedFor("contacts") {
			fmt.Printf("setcontact (%s) contactID=%s already exists, skip (%s) %s %s\n",
				calleeID, contactID, newCompoundName, remoteAddr, comment)
		}
		return true
	}

	// we may override the name of a contact edited by callee (oldCompoundName) with the nickname given by caller
//	if logWantedFor("contacts") {
		fmt.Printf("setcontact (%s) store ID=%s from (%s) to (%s) %s %s\n",
			calleeID, contactID, oldCompoundName, newCompoundName, remoteAddr, comment)
//	}
	idNameMap[contactID] = newCompoundName
	//fmt.Printf("setcontact (%s) idNameMap=%v\n", calleeID, idNameMap[contactID])
	err = kvContacts.Put(dbContactsBucket, calleeID, idNameMap, false)
	if err!=nil {
		fmt.Printf("# setcontact (%s) store contactID=%s %s err=%v\n", calleeID, contactID, remoteAddr, err)
		return false
	}
	return true
}

func httpDeleteContact(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /deletecontact calleeID empty %s\n", remoteAddr)
		return
	}
	if(cookie==nil) {
		fmt.Printf("# /deletecontact cookie==nil urlID=%s calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}

	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!=calleeID {
		fmt.Printf("# /deletecontact urlID=%s != calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}

	contactID := ""
	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID = url_arg_array[0]
	}
	if contactID=="" {
		fmt.Printf("# /deletecontact (%s) contactID from client is empty %s\n", calleeID, remoteAddr)
		return
	}

	// delete a single contactID from calleeID's contacts
	var idNameMap map[string]string // callerID -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&idNameMap)
	if err!=nil {
		fmt.Printf("# /deletecontact db get calleeID=%s %s err=%v\n", calleeID, remoteAddr, err)
		return
	}

	_,ok = idNameMap[contactID]
	if !ok {
		_,ok = idNameMap[strings.ToLower(contactID)]
		if ok {
			contactID = strings.ToLower(contactID)
		} else {
			// contactID not found, try with attached @hostname
			tryContactID := contactID+"@"+hostname;
			if strings.Index(contactID,"@")<0 {
				tryContactID = contactID+"@@"+hostname;
			}
			_,ok = idNameMap[tryContactID]
			if ok {
				contactID = tryContactID;
			} else {
				// tryContactID = contactID@@hostname not found,
				if contactID!="" {
					// delete the first entry that starts with contactID
					tryContactID = contactID
					contactID = ""
				}
				if tryContactID!="" {
					for k := range idNameMap {
						if strings.HasPrefix(k,tryContactID) {
							contactID = k;
							break
						}
					}
				}
				if contactID=="" {
					// found no such entry
					fmt.Printf("# /deletecontact (%s) idNameMap[%s/%s] does not exist %s\n",
						calleeID, contactID, tryContactID, remoteAddr)
					for k := range idNameMap {
						fmt.Printf("...key=(%s)\n",k)
					}
					return
				}
			}
		}
	}
	delete(idNameMap,contactID)
	err = kvContacts.Put(dbContactsBucket, calleeID, idNameMap, false)
	if err!=nil {
		fmt.Printf("# /deletecontact store calleeID=%s %s err=%v\n", calleeID, remoteAddr, err)
		return
	}
	if logWantedFor("contacts") {
		fmt.Printf("/deletecontact calleeID=(%s) contactID[%s] %s\n",calleeID, contactID, remoteAddr)
	}
	fmt.Fprintf(w,"ok")
	return
}

