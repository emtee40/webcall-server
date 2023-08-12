// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// These methods enable callees to managed temporary ID's.

package main

import (
	"net/http"
	"fmt"
	"io"
	"time"
	"strings"
)


func httpGetMapping(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	fmt.Printf("/getmapping (%s) urlID=%s %s\n", calleeID, urlID, remoteAddr)
	if calleeID=="" {
		fmt.Printf("# /getmapping calleeID empty urlID=%s %s\n",urlID, remoteAddr)
		fmt.Fprintf(w,"errorNoCalleeID")
		return
	}
	if cookie==nil {
		fmt.Printf("# /getmapping (%s) fail no cookie %s\n", calleeID, remoteAddr)
		fmt.Fprintf(w,"errorNoCookie")
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /getmapping urlID=%s != calleeID=%s %s\n",urlID,calleeID, remoteAddr)
		fmt.Fprintf(w,"errorWrongCookie")
		return
	}

	errcode,altIDs := getMapping(calleeID,remoteAddr)
	if errcode==0 && altIDs!="" {
		fmt.Fprintf(w,altIDs)
	}
	// if(xhr.responseText=="") there are no altIDs
}

func getMapping(calleeID string, remoteAddr string) (int,string) {
	// use calleeID to get AltIDs from DbUser
	// format: id,true,usage|id,true,usage|...
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# getmapping (%s) get dbRegisteredIDs rip=%s err=%v\n", calleeID, remoteAddr, err)
		}
		return 1,""
	}

	dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# getmapping (%s) get dbUser (%s) rip=%s err=%v\n", calleeID, dbUserKey, remoteAddr, err)
		}
		return 2,""
	}

	if dbUser.AltIDs!="" {
		if logWantedFor("mapping") {
			fmt.Printf("getmapping (%s) altIDs=(%s) rip=%s\n", calleeID, dbUser.AltIDs, remoteAddr)
		}
	}
	return 0,dbUser.AltIDs
}

func isLowecaseLetter(c rune) bool {
	return ('a' <= c && c <= 'z') || ('0' <= c && c <= '9')
}

func isLowercaseWord(s string) bool {
	for _, c := range s {
	    if !isLowecaseLetter(c) {
	        return false
	    }
	}
	return true
}

func httpSetMapping(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /setmapping calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /setmapping (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /setmapping urlID=%s != calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}

	data := ""
	postBuf := make([]byte, 2000)
	length,_ := io.ReadFull(r.Body, postBuf)
	if length>0 {
		data = string(postBuf[:length])
	}

	if strings.Index(data,"<")>=0 || strings.Index(data,"\n")>=0 {
		dispData := data
		if len(data)>40 { dispData = data[:40] }
		fmt.Printf("# /setmapping (%s) data=(%s) format error \n",calleeID, dispData)
		time.Sleep(1000 * time.Millisecond)
		fmt.Fprintf(w,"errorFormat")
		return
	}

	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		fmt.Printf("# /setmapping (%s) get dbEntry data=(%s) err=%v\n",calleeID, data, err)
		time.Sleep(1000 * time.Millisecond)
		fmt.Fprintf(w,"errorGetID")
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# /setmapping (%s) get dbUser data=(%s) err=%v\n",calleeID, data, err)
		time.Sleep(1000 * time.Millisecond)
		fmt.Fprintf(w,"errorGetUser")
		return
	}

	// /setmapping (98597153158) done data=(93489236986,true,|77728892315,true,|48849331002,true,|94042933561,true,)
	fmt.Printf("/setmapping (%s) data=(%s) check...\n",calleeID, data)

	// verify each element in data before writing over dbUser.AltIDs
	if data!="" {
		var acceptedIDs []string
		toks := strings.Split(data, "|")
		if len(toks)>5 {
			fmt.Printf("# /setmapping (%s) data=(%s) count=%d error\n",calleeID, data, len(toks))
			time.Sleep(1000 * time.Millisecond)
			fmt.Fprintf(w,"errorCount")
			return
		}
		for tok := range toks {
			toks2 := strings.Split(toks[tok], ",")
			if toks2[0] != "" {
				// verify mappedID: a-z 0-9, min/max len
				mappedID := toks2[0]
				if(!isLowercaseWord(mappedID)) {
					// found forbidden char
					fmt.Printf("# /setmapping (%s) mappedID=(%s) special char error\n",calleeID, mappedID)
					time.Sleep(1000 * time.Millisecond)
					fmt.Fprintf(w,"errorFormat")
					return
				}
				if len(mappedID)<3 || len(mappedID)>16 {
					fmt.Printf("# /setmapping (%s) mappedID=(%s) length error\n",calleeID, mappedID)
					time.Sleep(1000 * time.Millisecond)
					fmt.Fprintf(w,"errorLength")
					return
				}

				// check for duplicates
				for _, v := range acceptedIDs {
					if(v==mappedID) {
						fmt.Printf("! /setmapping (%s) mappedID=(%s) is duplicate\n", calleeID, mappedID)
						time.Sleep(1000 * time.Millisecond)
						fmt.Fprintf(w,"errorDuplicate")
						return
					}
				}

				// verify assignedName: max len 10
				assignedName := toks2[2]
/* TODO allow uppercase assignedName
				if(!isLowercaseWord(assignedName)) {
					// found forbidden char
					fmt.Printf("# /setmapping (%s) assignedName=(%s) special char error\n",calleeID, assignedName)
					time.Sleep(1000 * time.Millisecond)
					fmt.Fprintf(w,"errorFormat")
					return
				}
*/
				if len(assignedName)>10 {
					fmt.Printf("# /setmapping (%s) assignedName=(%s) length error\n",calleeID, assignedName)
					time.Sleep(1000 * time.Millisecond)
					fmt.Fprintf(w,"errorLength")
					return
				}

				// mappedID must not be in use by anyone else yet (other than by calleeID)
				// if it is already used by us (calleeID) or by noone, that is fine

				// check if mappedID is already mapped
				mappingMutex.RLock()
				mappingData,ok := mapping[mappedID]
				mappingMutex.RUnlock()
				if ok {
					if mappingData.CalleeId != calleeID {
						// mappedID is already mapped and not by this calleeID
						fmt.Printf("# /setmapping (%s) mappedID=(%s) already mapped\n",calleeID, mappedID)
						time.Sleep(1000 * time.Millisecond)
						fmt.Fprintf(w,"errorBlocked")
						return
					}
					//fmt.Printf("/setmapping (%s) mappedID=(%s) mapped by us\n",calleeID, mappedID)
				} else {
					//fmt.Printf("/setmapping (%s) mappedID=(%s) not mapped\n",calleeID, mappedID)
				}

				var dbMappedEntry DbEntry
				err := kvMain.Get(dbRegisteredIDs, mappedID, &dbMappedEntry)
				if err == nil {
					fmt.Printf("/setmapping (%s) mappedID=(%s) load dbMappedUser... (%v)\n",
						calleeID, mappedID, dbMappedEntry)
					dbUserKey := fmt.Sprintf("%s_%d", mappedID, dbMappedEntry.StartTime)
					var dbMappedUser DbUser
					err = kvMain.Get(dbUserBucket, dbUserKey, &dbMappedUser)
					if err == nil {
						// mappedID is already someone elses valid CalleeId
						fmt.Printf("# /setmapping (%s) mappedID=(%s) already a calleeID (%v)\n",
							calleeID, mappedID, dbMappedEntry)
						time.Sleep(1000 * time.Millisecond)
						fmt.Fprintf(w,"errorBlocked")
						return
					}
				}

				err = kvMain.Get(dbBlockedIDs,mappedID,&dbMappedEntry)
				//fmt.Printf("! /setmapping (%s) mappedID=(%s) entry(%v) err=%v\n",calleeID, mappedID, dbMappedEntry, err)
				if err==nil {
					// found in dbBlockedIDs
					// but not blocked if dbMappedEntry.Ip == calleeID
					if dbMappedEntry.Ip != calleeID {
						fmt.Printf("! /setmapping (%s) mappedID=(%s) currently blocked (%v)\n",
							calleeID, mappedID, dbMappedEntry)
						time.Sleep(1000 * time.Millisecond)
						fmt.Fprintf(w,"errorCurrentlyBlocked")
						return
					}
				}

				//fmt.Printf("/setmapping (%s) mappedID=(%s) is available/valid\n",calleeID, mappedID)
				acceptedIDs = append(acceptedIDs,mappedID)
			}
		}
	}
	fmt.Printf("/setmapping (%s) data=(%s) is valid\n",calleeID, data)

	// store dbUser with new/valid AltIDs
	dbUser.AltIDs = data
	err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, true)
	if err != nil {
		fmt.Printf("# /setmapping (%s) put dbUser data=(%s) err=%v\n",calleeID, data, err)
		time.Sleep(1000 * time.Millisecond)
		fmt.Fprintf(w,"errorStore")
		return
	}
	// we must add any new mappedID to mapping[] as quickly as possible, before another client may want to make use of it

	// update mapping[] and ringMuted[] according to AltIDs
	if data!="" {
		//fmt.Printf("initloop %s (%s)->%s\n",k,calleeID,data)
		toks := strings.Split(data, "|")
		for tok := range toks {
			toks2 := strings.Split(toks[tok], ",")
			if toks2[0] != "" {
				// ensure mappedID is not overlong and does not contain wrong format data (e.g. HTML)
				mappedID := toks2[0]
				ringMutedMutex.Lock()
				if toks2[1] != "true" {
					// this mapping has been deactivated: set ringMuted
					fmt.Printf("/setmapping (%s) set ringMuted for (%s)\n",calleeID, mappedID)
					ringMuted[mappedID] = struct{}{}
				} else {
					// this mapping is activated: clear ringMuted
					//fmt.Printf("/setmapping (%s) clear ringMuted for (%s)\n",calleeID, mappedID)
					delete(ringMuted,mappedID)
				}
				ringMutedMutex.Unlock()

				mappingData := mapping[mappedID]
				if mappingData.CalleeId != calleeID {
					assignedName := toks2[2]

					fmt.Printf("/setmapping (%s) set (%s)=(%s)\n",calleeID, mappedID, assignedName)
					mappingMutex.Lock()
					mapping[mappedID] = MappingDataType{calleeID,assignedName}
					mappingMutex.Unlock()

					// remove mappedID from dbBlockedIDs
					kvMain.Delete(dbBlockedIDs, mappedID)
				}
			}
		}
	}

	//fmt.Printf("/setmapping (%s) done data=(%s)\n",calleeID, data)
	return
}

func httpFetchID(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string, startRequestTime time.Time) {
	// fetch a new unused callee-ID
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /fetchid calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /fetchid (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /fetchid urlID=%s != calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}

	if allowNewAccounts {
		// create new random, free ID, register it and return it
		registerID,err := GetRandomCalleeID()
		if err!=nil {
			fmt.Printf("# /fetchid (%s) GetRandomCalleeID err=%v\n",calleeID,err)
			return
		}
		if registerID=="" {
			fmt.Printf("# /fetchid (%s) registerID is empty\n",calleeID)
			return
		}

		var dbEntryRegistered DbEntry
		err = kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
		if err==nil {
			// registerID is already registered
			fmt.Printf("# /fetchid (%s) newid=%s already registered db=%s bucket=%s\n",
				calleeID, registerID, dbMainName, dbRegisteredIDs)
			time.Sleep(1000 * time.Millisecond)
			fmt.Fprintf(w, "errorRegistered")
// TODO jump to GetRandomCalleeID()?
			return
		}

/*
		unixTime := startRequestTime.Unix()
		err = kvMain.Put(dbRegisteredIDs, registerID, DbEntry{unixTime, remoteAddr}, false)
		if err!=nil {
			fmt.Printf("# /fetchid (%s) error db=%s bucket=%s put err=%v\n",
				registerID,dbMainName,dbRegisteredIDs,err)
			time.Sleep(1000 * time.Millisecond)
			fmt.Fprintf(w,"errorRegisterFail")
			// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
		} else {
*/
			// add registerID -> calleeID (assign) to mapping.map
			mappingMutex.Lock()
			mapping[registerID] = MappingDataType{calleeID,"none"}
			mappingMutex.Unlock()
			fmt.Fprintf(w,registerID)
/*
		}
*/
	}

	return
}

func httpSetAssign(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// urlID is the tmpID to set assigb
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /setassign calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /setassign (%s) fail no cookie urlID=%s %s\n", calleeID, urlID, remoteAddr)
		return
	}
	if urlID=="" {
		fmt.Printf("# /setassign (%s) fail urlID empty %s\n", calleeID, urlID, remoteAddr)
		return
	}
	if calleeID!=urlID {
		// this happens bc someone with calleeID in the cookie is now trying to use urlID via url
		fmt.Printf("# /setassign urlID(%s) != calleeID(%s) %s ua=%s\n",
			urlID, calleeID, remoteAddr, r.UserAgent())
		return
	}

	setID := ""
	url_arg_array, ok := r.URL.Query()["setid"]
	if ok {
		setID = url_arg_array[0]
		if setID!="" {
			assign := "none"
			url_arg_array, ok = r.URL.Query()["assign"]
			if ok {
				assign = url_arg_array[0]

				fmt.Printf("/setassign (%s) setID=%s assign=%s %s\n", calleeID, setID, assign, remoteAddr)
				mappingMutex.Lock()
				mappingData := mapping[setID]
				mapping[setID] = MappingDataType{mappingData.CalleeId,assign}
				mappingMutex.Unlock()
				fmt.Fprintf(w,"ok")
			}
		}
	}
}

func httpDeleteMapping(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// urlID is the tmpID to be deleted
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /deletemapping calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /deletemapping (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	if urlID=="" {
		fmt.Printf("# /deletemapping (%s) fail urlID empty %s\n", calleeID, urlID, remoteAddr)
		return
	}
	if calleeID!=urlID {
		// this happens bc someone with calleeID in the cookie is now trying to use urlID via url
		fmt.Printf("# /deletemapping urlID(%s) != calleeID(%s) %s ua=%s\n",
			urlID, calleeID, remoteAddr, r.UserAgent())
		return
	}

	delID := ""
	url_arg_array, ok := r.URL.Query()["delid"]
	if ok {
		delID = url_arg_array[0]
		if delID!="" {
			errcode := deleteMapping(calleeID,delID,remoteAddr)
			switch(errcode) {
				case 1:
					fmt.Fprintf(w,"errorDeleteRegistered")
					return
				case 2:
					// ignore error creating dbBlockedID ???
			}

			fmt.Fprintf(w,"ok")
		}
	}
}

func deleteMapping(calleeID string, delID string, remoteAddr string) int {
/*
	// unregister delID from dbRegisteredIDs
	err := kvMain.Delete(dbRegisteredIDs, delID)
	if err!=nil && strings.Index(err.Error(), "skv key not found") < 0 {
		fmt.Printf("# deletemapping (%s) fail to delete regID=%s err=%s\n", calleeID, delID, err)
		return 1
	}
*/

	unixTime := time.Now().Unix()
	fmt.Printf("deletemapping (%s) id=%s rip=%s time=%v\n", calleeID, delID, remoteAddr, unixTime)

	// remove delID from mapping.map
	mappingMutex.Lock()
	delete(mapping,delID)
	mappingMutex.Unlock()

	// only needed to compensate for old bug: ignore err
	kvMain.Delete(dbRegisteredIDs, delID)

	// create a dbBlockedIDs entry (will be deleted after 60 days by timer)
	err := kvMain.Put(dbBlockedIDs, delID, DbEntry{unixTime,calleeID}, false)
	if err!=nil {
		fmt.Printf("# deletemapping (%s) error db=%s bucket=%s put key=%s err=%v\n",
			calleeID, dbMainName, dbBlockedIDs, delID, err)
		return 2
	}
	return 0
}

