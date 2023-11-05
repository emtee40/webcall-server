// WebCall Copyright 2023 timur.mobi. All rights reserved.
// skv layer for local db
package main

import (
	"strings"
	"strconv"
	"fmt"
	"time"
	"math/rand"
	"codeberg.org/timurmobi/webcall/skv"
)

// GetOnlineCallee(ID) can tell us (with optional ejectOn1stFound yes/no):
// "is calleeID online?", "is calleeID hidden online?", "is calleeID hidden online for my callerIpAddr?"
func locGetOnlineCallee(calleeID string, ejectOn1stFound bool, reportBusyCallee bool, reportHiddenCallee bool, callerIpAddr string, comment string) (string,*Hub,error) { // actual calleeID, hostingServerIp
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()

	if logWantedFor("searchhub") {
		fmt.Printf("GetOnlineCallee %s (%s) ejectOn1stFound=%v reportBusy=%v reportHidden=%v callerIpAddr=%s\n",
			calleeID,comment,ejectOn1stFound,reportBusyCallee, reportHiddenCallee,callerIpAddr)
	}
	calleeIdPlusExcl := calleeID+"!"
	count:=0
	for key := range hubMap {
		count++
		// wenn nicht=calleeID && fängt auch nicht mit calleeID! an, dann weitersuchen
		if key!=calleeID && !strings.HasPrefix(key,calleeIdPlusExcl) {
			continue
		}
		// found a fitting calleeID
		hub := hubMap[key]
		if logWantedFor("searchhub") {
			fmt.Printf("GetOnlineCallee found id=%s key=%s callerIP=%s hidden=%v\n", 
				calleeID, key, hub.ConnectedCallerIp, hub.IsCalleeHidden)
		}
		if hub.ConnectedCallerIp!="" && hub.ConnectedCallerIp!=callerIpAddr {
			if ejectOn1stFound {
				// found a fitting calleeID but this callee is busy (with someone else)
				if logWantedFor("searchhub") {
					fmt.Printf("GetOnlineCallee found callee %s busy with %s\n",key,hub.ConnectedCallerIp)
				}
				if reportBusyCallee {
					return key, hub, nil
				}
				return "", nil, nil
			}
			continue
		}

		if !hub.IsCalleeHidden {
			// found a fitting calleeID and it is free and not hidden
			if logWantedFor("searchhub") {
				fmt.Printf("GetOnlineCallee found callee %s is free + not hidden\n",key)
			}
			return key, hub, nil
		}

		if reportHiddenCallee {
			// found a fitting calleeID and while this callee is hidden, we are asked to report it anyway
			if logWantedFor("searchhub") {
				fmt.Printf("GetOnlineCallee found callee %s is free + hidden\n",key)
			}
			return key, hub, nil
		}

		// not sure this is needed anymore; it is now taken care of in httoOnline.go
		// see: "if locHub.IsCalleeHidden && locHub.IsUnHiddenForCallerAddr != remoteAddr"
		// IF this is still needed, then only when reportHiddenCallee==false
		// in any case I don't think this is doing any harm for now
		if hub.IsUnHiddenForCallerAddr!="" && callerIpAddr == hub.IsUnHiddenForCallerAddr {
			// found a fitting calleeID which is hidden, but is visible for this caller
			if logWantedFor("searchhub") {
				fmt.Printf("GetOnlineCallee found callee %s free + hidden + visible to caller\n",key)
			}
			return key, hub, nil
		}
	}
	if logWantedFor("searchhub") {
		fmt.Printf("GetOnlineCallee nothing found for calleeID=%s count=%d\n",calleeID,count)
	}
	return "", nil, nil
}

func locStoreCallerIpInHubMap(calleeId string, callerIp string, skipConfirm bool) error {
	var err error = nil
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		if logWantedFor("searchhub") {
			fmt.Printf("StoreCallerIpInHubMap calleeId=%s (not found) set callerIp=%s\n",
				calleeId, callerIp)
		}
		err = skv.ErrNotFound
	} else {
		if hub.ConnectedCallerIp != callerIp {

			if callerIp == "" && recentTurnCalleeIps!=nil {
				// client is gone, but we prolong turn session by a few secs, to avoid turn-errors
				ipAddr := hub.ConnectedCallerIp
				if portIdx := strings.Index(ipAddr, ":"); portIdx >= 0 {
					ipAddr = ipAddr[:portIdx]
				}
				//fmt.Printf("StoreCallerIpInHubMap prolong turn for callerIp=%s\n", ipAddr)
				recentTurnCalleeIpMutex.Lock()
				recentTurnCalleeIps[ipAddr] = TurnCallee{calleeId,time.Now()}
				recentTurnCalleeIpMutex.Unlock()
			}

			if logWantedFor("searchhub") {
				fmt.Printf("StoreCallerIpInHubMap calleeId=%s set callerIp=%s was=%s\n",
					calleeId, callerIp, hub.ConnectedCallerIp)
			}

			hub.ConnectedCallerIp = callerIp
			hubMap[calleeId] = hub
		} else {
			if logWantedFor("searchhub") {
				fmt.Printf("StoreCallerIpInHubMap calleeId=%s set callerIp=%s was already set\n",
					calleeId, callerIp)
			}
		}
	}
	return err
}

func locSearchCallerIpInHubMap(ip string) (bool,string,error) {
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	for id := range hubMap {
		hub := hubMap[id]
		if strings.HasPrefix(hub.ConnectedCallerIp,ip) {
			if logWantedFor("ipinhub") {
				fmt.Printf("SearchCallerIpInHubMap ip=%s found\n",ip)
			}
			//return true,hub.GlobalCalleeID,nil
			if hub.CalleeClient!=nil {
				return true,hub.CalleeClient.calleeID,nil
			}
			return true,"",nil
		}
	}
	if logWantedFor("ipinhub") {
		fmt.Printf("SearchCallerIpInHubMap ip=%s not found\n",ip)
	}
	return false,"",nil
}

func locDeleteFromHubMap(id string) (int64,error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	delete(hubMap,id)
	return int64(len(hubMap)),nil
}

func locStoreCalleeInHubMap(key string, hub *Hub, multiCallees string, remoteAddrWithPort string, wsClientID uint64, skipConfirm bool) (string,int64,error) {
	//fmt.Printf("StoreCalleeInHubMap start key=%s\n",key)
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()

	if strings.Index(multiCallees,"|"+key+"|")>=0 {
		newKey := ""
		for i:=0; i<100; i++ {
			var idExt uint64 = uint64(rand.Int63n(int64(99999999999)))
			if(idExt < uint64(10000000000)) {
				continue
			}
			newKey = key + "!" + strconv.FormatInt(int64(idExt),10)
			_,ok := hubMap[newKey]
			//fmt.Printf("StoreCalleeInHubMap try key=%s ok=%v idx=%d\n",newKey,ok,idx)
			if !ok {
				// newKey does not exist yet - found a free slot: exit loop
				break
			}
			// newKey exists - must continue to search for a free slot
			//if i>=98 {
			//	fmt.Printf("StoreCalleeInHubMap %d tries\n",i)
			//}
		}
		key = newKey
	}
	//fmt.Printf("StoreCalleeInHubMap final key=%s\n",key)
	hubMap[key] = hub
	return key, int64(len(hubMap)), nil
}

func locGetRandomCalleeID() (string,error) {
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()

	mappingMutex.RLock()
	defer mappingMutex.RUnlock()

	newCalleeId := ""
	tries := 0
	for {
		tries++
		intID := uint64(rand.Int63n(int64(99999999999)))
		if(intID<uint64(10000000000)) {
			continue;
		}
		//newCalleeId = fmt.Sprintf("%d",intID)
		newCalleeId = strconv.FormatInt(int64(intID),10)
		hub := hubMap[newCalleeId]
		if hub!=nil {
			continue;
		}

		_,ok := mapping[newCalleeId]
		if ok {
			continue;
		}

		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs,newCalleeId,&dbEntry)
		if err==nil {
			// found in dbRegisteredIDs
			//fmt.Printf("getRandomCalleeID %v exists already in dbRegisteredIDs\n",newCalleeId)
			continue;
		}
		err = kvMain.Get(dbBlockedIDs,newCalleeId,&dbEntry)
		if err==nil {
			// found in dbBlockedIDs
			//fmt.Printf("getRandomCalleeID %v exists already in dbBlockedIDs\n",newCalleeId)
			continue;
		}
		// newCalleeId not found anywhere - is accepted!
		if tries>=5 {
			fmt.Printf("# getRandomCalleeID (%s) tries=%d\n", newCalleeId, tries)
		}
		return newCalleeId, nil
	}
}

func locSetCalleeHiddenState(calleeId string, hidden bool) (error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		return skv.ErrNotFound
	}
	hub.IsCalleeHidden = hidden
	return nil
}

func locSetUnHiddenForCaller(calleeId string, callerIp string) (error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		return skv.ErrNotFound
	}
	hub.IsUnHiddenForCallerAddr = callerIp
	return nil
}

