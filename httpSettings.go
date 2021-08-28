package main

import (
	"net/http"
	"fmt"
	"net/url"
	"encoding/json"
	"io"
	"github.com/mehrvarz/webcall/rkv"
)

func httpGetSettings(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if cookie==nil {
		// no settings without a cookie (but not worth logging)
		//fmt.Printf("# /getsettings fail calleeID(%s) cookie==nil rip=%s\n", calleeID, remoteAddr)
		return
	}
	if calleeID=="" {
		fmt.Printf("# /getsettings fail no calleeID rip=%s\n", remoteAddr)
		return
	}
	if calleeID!=urlID {
		fmt.Printf("# /getsettings fail calleeID(%s) != urlID(%s) rip=%s\n", calleeID, urlID, remoteAddr)
		return
	}

	var dbEntry rkv.DbEntry
	err := db.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /getsettings (%s) fail on dbRegisteredIDs rip=%s\n", calleeID, remoteAddr)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser rkv.DbUser
	err = db.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /getsettings (%s) fail on dbUserBucket rip=%s\n", calleeID, remoteAddr)
		return
	}

	calleeName := dbUser.Name
	var reqBody []byte
	reqBody, err = json.Marshal(map[string]string{
		"nickname": calleeName,
		"twname": dbUser.Email2, // twitter handle (starting with @)
		"twid": dbUser.Str1, // twitter user_id  // not yet used by settings app
		"webPushSubscription1": dbUser.Str2,
		"webPushUA1": dbUser.Str2ua,
		"webPushSubscription2": dbUser.Str3,
		"webPushUA2": dbUser.Str3ua,
	})
	if err != nil {
		fmt.Printf("# /getsettings (%s) fail on json.Marshal rip=%s\n", calleeID, remoteAddr)
		return
	}
	if logWantedFor("getsettings") {
		fmt.Printf("/getsettings for (%s) [%s]\n",calleeID,reqBody)
	}
	fmt.Fprintf(w,string(reqBody))
	return
}

func httpSetSettings(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /setsettings fail no calleeID rip=%s\n", remoteAddr)
		return
	}
	if cookie==nil {
		fmt.Printf("# /setsettings (%s) fail no cookie rip=%s\n", calleeID, remoteAddr)
		return
	}

	if calleeID!=urlID {
		fmt.Printf("# /setsettings fail calleeID(%s) != urlID(%s) rip=%s\n", calleeID, urlID, remoteAddr)
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
		fmt.Printf("# /setsettings (%s) failed on io.ReadFull body rip=%s\n",calleeID, remoteAddr)
		return
	}
	fmt.Printf("/setsettings (%s) body (%s) %d rip=%s\n", calleeID, data, len(data), remoteAddr)

	var newSettingsMap map[string]string
	err := json.Unmarshal([]byte(data), &newSettingsMap)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on json.Unmarshal (%v) err=%v\n", calleeID, data, err)
		return
	}

	var dbEntry rkv.DbEntry
	err = db.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on dbRegisteredIDs rip=%s\n", calleeID, remoteAddr)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser rkv.DbUser
	err = db.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on dbUserBucket rip=%s\n", calleeID, remoteAddr)
		return
	}

	for key,val := range newSettingsMap {
		switch(key) {
		case "nickname":
			fmt.Printf("/setsettings (%s) new nickname (%s) (old:%s)\n",calleeID,val,dbUser.Name)
			dbUser.Name = val
// TODO		calleeName = dbUser.Name
		case "twname":
			fmt.Printf("/setsettings (%s) new twname (%s) (old:%s)\n",calleeID,val,dbUser.Email2)
			dbUser.Email2 = val
		case "twid":  // not yet used by settings app
			fmt.Printf("/setsettings (%s) new twid (%s) (old:%s)\n",calleeID,val,dbUser.Str1)
			dbUser.Str1 = val
		case "webPushSubscription1":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushSubscription1 err=%v\n",
					calleeID, err)
			} else {
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
							fmt.Printf("# setsettings (%s) webpush fail device1 err=%v\n",urlID,err)
						} else if statusCode==201 {
							// success
						} else if statusCode==410 {
							fmt.Printf("# setsettings (%s) webpush fail device1 delete subscr\n",
								urlID)
							dbUser.Str2 = ""
						} else {
							fmt.Printf("# setsettings (%s) webpush fail device1 status=%d\n",
								urlID, statusCode)
						}
					}
				}
			}
		case "webPushUA1":
			dbUser.Str2ua = val
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushUA1 err=%v\n",
					calleeID, err)
			} else {
				fmt.Printf("/setsettings (%s) new webPushUA1 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str2ua)
				dbUser.Str2ua = newVal
			}
		case "webPushSubscription2":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushSubscription2 err=%v\n",
					calleeID, err)
			} else {
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
							fmt.Printf("# /setsettings (%s) webpush fail device2 err=%v\n",urlID,err)
						} else if statusCode==201 {
							// success
						} else if statusCode==410 {
							fmt.Printf("# /setsettings (%s) webpush fail device2 delete subscr\n",
								urlID)
							dbUser.Str3 = ""
						} else {
							fmt.Printf("# /setsettings (%s) webpush fail device2 status=%d\n",
								urlID, statusCode)
						}
					}
				}
			}
		case "webPushUA2":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushUA2 err=%v\n",
					calleeID, err)
			} else {
				fmt.Printf("/setsettings (%s) new webPushUA2 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str3ua)
				dbUser.Str3ua = newVal
			}
		}
	}

	// store data
	err = db.Put(dbUserBucket, dbUserKey, dbUser, false)
	if err!=nil {
		fmt.Printf("# /setsettings error db=%s bucket=%s put key=%s err=%v\n",
			dbName,dbUserBucket,calleeID,err)
	} else {
		fmt.Printf("/setsettings db=%s bucket=%s put key=%s\n",
			dbName,dbUserBucket,calleeID)
	}
	return
}

func httpGetContacts(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if urlID=="" {
		fmt.Printf("# /getcontacts urlID empty\n")
		return
	}
	if urlID!=calleeID {
		fmt.Printf("# /getcontacts urlID=%s != calleeID=%s\n",urlID,calleeID)
		return
	}
	var callerInfoMap map[string]string // callerID -> name
	err := dbContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		fmt.Printf("# /getcontacts db get calleeID=%s err=%v\n", calleeID, err)
		return
	}
	jsonStr, err := json.Marshal(callerInfoMap)
	if err != nil {
		fmt.Printf("# /getcontacts (%s) failed on json.Marshal err=%v\n", urlID, err)
		return
	}
	fmt.Printf("/getcontacts (%s) send %d elements\n",calleeID,len(callerInfoMap))
	fmt.Fprintf(w,string(jsonStr))
	return
}

func httpSetContacts(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if urlID=="" {
		fmt.Printf("# /setcontact urlID empty\n")
		return
	}
	if urlID!=calleeID {
		fmt.Printf("# /setcontact urlID=%s != calleeID=%s\n",urlID,calleeID)
		return
	}

	contactID := ""
	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID = url_arg_array[0]
	}
	if contactID=="" {
		fmt.Printf("# /setcontact (%s) contactID from client is empty\n", calleeID)
		return
	}

	name := ""
	url_arg_array, ok = r.URL.Query()["name"]
	if ok && len(url_arg_array[0]) >= 1 {
		name = url_arg_array[0]
	}

	var callerInfoMap map[string]string // callerID -> name
	err := dbContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		fmt.Printf("# /setcontact db get calleeID=%s err=%v\n", calleeID, err)
		return
	}

	oldName,ok := callerInfoMap[contactID]
	if !ok {
		fmt.Printf("# /setcontact (%s) callerInfoMap[%s] does not exist\n", calleeID, contactID)
		return
	}

	callerInfoMap[contactID] = name
	err = dbContacts.Put(dbContactsBucket, calleeID, callerInfoMap, false)
	if err!=nil {
		fmt.Printf("# /setcontact store calleeID=%s err=%v\n", calleeID, err)
		return
	}
	fmt.Printf("/setcontact (%s) changed name from (%s) to (%s)\n",calleeID, oldName,name)
	fmt.Fprintf(w,"ok")
	return
}

func httpDeleteContact(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if urlID=="" {
		fmt.Printf("# /deletecontact urlID empty\n")
		return
	}
	if urlID!=calleeID {
		fmt.Printf("# /deletecontact urlID=%s != calleeID=%s\n",urlID,calleeID)
		return
	}

	contactID := ""
	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID = url_arg_array[0]
	}
	if contactID=="" {
		fmt.Printf("# /deletecontact (%s) contactID from client is empty\n", calleeID)
		return
	}

	var callerInfoMap map[string]string // callerID -> name
	err := dbContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		fmt.Printf("# /deletecontact db get calleeID=%s err=%v\n", calleeID, err)
		return
	}

	_,ok = callerInfoMap[contactID]
	if !ok {
		fmt.Printf("# /deletecontact (%s) callerInfoMap[%s] does not exist\n", calleeID, contactID)
		return
	}
	delete(callerInfoMap,contactID)
	err = dbContacts.Put(dbContactsBucket, calleeID, callerInfoMap, false)
	if err!=nil {
		fmt.Printf("# /deletecontact store calleeID=%s err=%v\n", calleeID, err)
		return
	}
	fmt.Printf("/deletecontact calleeID=(%s) contactID[%s]\n",calleeID, contactID)
	fmt.Fprintf(w,"ok")
	return
}

