// WebCall Copyright 2022 timur.mobi. All rights reserved.
package main

import (
	"net/http"
	"fmt"
	"time"
	"strconv"
	"errors"
	"bytes"
	"strings"
	"io"
	"encoding/gob"
	bolt "go.etcd.io/bbolt"
	"github.com/nxadm/tail" // https://pkg.go.dev/github.com/nxadm/tail
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/atombool"
)

func httpAdmin(kv skv.SKV, w http.ResponseWriter, r *http.Request, urlPath string, urlID string, remoteAddr string) bool {
	printFunc := func(w http.ResponseWriter, format string, a ...interface{}) {
		// printFunc writes to the console AND to the localhost http client
		fmt.Printf(format, a...)
		fmt.Fprintf(w, format, a...)
	}

	if urlPath=="/dumpuser" {
		bucketName := dbUserBucket
		printFunc(w,"/dumpuser dbName=%s bucketName=%s\n", dbMainName, bucketName)
		db := kv.Db
		nowTimeUnix := time.Now().Unix()
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(bucketName))
			if b==nil {
				return errors.New("read bucket error "+bucketName)
			}
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var dbUser DbUser
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbUser)
				lastActivity := dbUser.LastLogoffTime;
				if dbUser.LastLoginTime > dbUser.LastLogoffTime {
					lastActivity = dbUser.LastLoginTime
				}
				secsSinceLastActivity := "-"
				if lastActivity > 0 {
					secsSinceLastActivity = fmt.Sprintf("%d",nowTimeUnix-lastActivity)
				}
				fmt.Fprintf(w, "user %22s calls=%4d p2p=%4d/%4d talk=%6d %d %s %s %s\n",
					k,
					dbUser.CallCounter,
					dbUser.LocalP2pCounter, dbUser.RemoteP2pCounter,
					dbUser.ConnectedToPeerSecs,
					dbUser.Int2,
					time.Unix(dbUser.LastLoginTime,0).Format("2006-01-02 15:04:05"),
					time.Unix(dbUser.LastLogoffTime,0).Format("2006-01-02 15:04:05"),
					secsSinceLastActivity)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpuser err=%v\n", err)
		} else {
			fmt.Fprintf(w,"/dumpuser no err\n")
		}
		return true
	}

	if urlPath=="/dumpregistered" {
		// show the list of callee-IDs that have been registered and are not yet outdated
		bucketName := dbRegisteredIDs
		printFunc(w,"/dumpregistered dbName=%s bucketName=%s\n", dbMainName, bucketName)
		db := kv.Db
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(bucketName))
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var dbEntry DbEntry
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)
				fmt.Fprintf(w,"registered id=%s %d=%s\n",
					k, dbEntry.StartTime, time.Unix(dbEntry.StartTime,0).Format("2006-01-02 15:04:05"))
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpregistered err=%v\n", err)
		} else {
			fmt.Fprintf(w,"/dumpregistered no err\n")
		}
		return true
	}

	if urlPath=="/dumpblocked" {
		// show the list of callee-IDs that are blocked (for various reasons)
		bucketName := dbBlockedIDs
		printFunc(w,"/dumpblocked dbName=%s bucketName=%s\n", dbMainName, bucketName)
		db := kv.Db
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(bucketName))
			c := b.Cursor()
			for id, v := c.First(); id != nil; id, v = c.Next() {
				var dbEntry DbEntry
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)
				starttime := time.Unix(dbEntry.StartTime,0)
				fmt.Fprintf(w,"blocked id=%s start=%d=%s rip=%s\n",
					id, dbEntry.StartTime, starttime.Format("2006-01-02 15:04:05"), dbEntry.Ip)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpblocked err=%v\n", err)
		} else {
			fmt.Fprintf(w,"/dumpblocked no err\n")
		}
		return true
	}

	if urlPath=="/deluserid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /deluserid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]
		urlTimei64, err := strconv.ParseInt(urlTime, 10, 64)
		if err!=nil {
			printFunc(w,"# /deluserid error converting arg 'time'=%d to int64 %v\n",urlTime,err)
			return true
		}
		userKey := fmt.Sprintf("%s_%d",urlID, urlTimei64)
		bucketName := dbUserBucket
		fmt.Printf("/deluserid dbName=%s bucketName=%s\n", dbMainName, bucketName)
		err = kv.Delete(dbUserBucket, userKey)
		if err!=nil {
			printFunc(w,"# /deluserid fail to delete user key=%v %v\n", userKey, err)
		} else {
			printFunc(w,"/deluserid deleted user key=%v\n", userKey)
		}
		return true
	}

	if urlPath=="/delregisteredid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /delregisteredid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]

		var dbEntry DbEntry
		err := kv.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /delregisteredid urlID not found\n")
			return true
		}

		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /delregisteredid time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		bucketName := dbRegisteredIDs
		fmt.Printf("/delregisteredid dbName=%s bucketName=%s\n", dbMainName, bucketName)
		err = kv.Delete(bucketName, urlID)
		if err!=nil {
			printFunc(w,"# /delregisteredid fail to delete blocked id=%s\n", urlID)
		} else {
			printFunc(w,"/delregisteredid deleted id=%s\n", urlID)
		}
		return true
	}

	if urlPath=="/delblockedid" {
		bucketName := dbBlockedIDs
		var dbEntry DbEntry
		err := kv.Get(bucketName,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /delblockedid urlID not found\n")
			return true
		}

		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /delblockedid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]

		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /delblockedid time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		fmt.Printf("/delblockedid dbName=%s bucketName=%s\n", dbMainName, bucketName)

		err = kv.Delete(bucketName, urlID)
		if err!=nil {
			printFunc(w,"# /delblockedid fail to delete id=%s\n", urlID)
		} else {
			printFunc(w,"/delblockedid deleted id=%s\n", urlID)
		}
		return true
	}

	if urlPath=="/makeregistered" {
		// show the list of callee-IDs that have been registered and are not yet outdated
		// ".../makeregistered?id=answie&days=xx&pw=123456"

		// get service days from url-arg
		url_arg_array, ok := r.URL.Query()["sdays"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /makeregistered url arg 'days' not given\n")
			return true
		}
		urlSDaysStr := url_arg_array[0]
		urlSDaysI64, err := strconv.ParseInt(urlSDaysStr, 10, 64)
		if err!=nil {
			printFunc(w,"# /makeregistered error converting 'days'=%s to int %v\n",urlSDaysStr,err)
			return true
		}
		urlSDays := int(urlSDaysI64)

		// service minutes (optional)
		urlSMinutes := 0
		url_arg_array, ok = r.URL.Query()["smin"]
		if !ok || len(url_arg_array[0]) < 1 {
			// ignore
		} else {
			urlSMinutesI64, err := strconv.ParseInt(url_arg_array[0], 10, 64)
			if err!=nil {
				// ignore
			} else {
				urlSMinutes = int(urlSMinutesI64)
			}
		}
		if (urlSDays<=0 && urlSMinutes<=0) /*|| urlTMinutes<0*/ {
			printFunc(w,"# /makeregistered error both 'sdays' and 'smin' or 'tmin' <0\n")
			return true
		}

		// get pw from url-arg
		url_arg_array, ok = r.URL.Query()["pw"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /makeregistered url arg 'pw' not given\n")
			return true
		}
		urlPw := url_arg_array[0]

		fmt.Printf("/makeregistered dbName=%s\n", dbMainName)

		unixTime := time.Now().Unix()
		dbUserKey := fmt.Sprintf("%s_%d",urlID, unixTime)
		dbUser := DbUser{Ip1:remoteAddr}
		err = kv.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			printFunc(w,"# /makeregistered error db=%s bucket=%s put key=%s err=%v\n",
				dbMainName,dbUserBucket,urlID,err)
		} else {
			err = kv.Put(dbRegisteredIDs, urlID,
				DbEntry{unixTime, remoteAddr, urlPw}, false)
			if err!=nil {
				printFunc(w,"# /makeregistered error db=%s bucket=%s put key=%s err=%v\n",
					dbMainName,dbRegisteredIDs,urlID,err)
			} else {
				printFunc(w,"/makeregistered db=%s bucket=%s new id=%s created\n",
					dbMainName,dbRegisteredIDs,urlID)
			}
		}
		if err!=nil {
			printFunc(w,"# /makeregistered id=%s err=%v\n", urlID, err)
		} else {
			printFunc(w,"/makeregistered id=%s no err\n", urlID)
		}
		return true
	}

	if urlPath=="/editprem" {
		var dbEntry DbEntry
		err := kv.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /editprem urlID=(%s) not found\n",urlID)
			return true
		}

		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /editprem url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]
		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /editprem time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
		var dbUser DbUser
		err = kv.Get(dbUserBucket, dbUserKey, &dbUser)
		if err!=nil {
			fmt.Printf("# /editprem (%s) failed on dbUserBucket\n",urlID)
			return true
		}

		err = kv.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			printFunc(w,"# /editprem error db=%s bucket=%s put key=%s err=%v\n",
				dbMainName,dbUserBucket,urlID,err)
		} else {
			printFunc(w,"/editprem db=%s bucket=%s new id=%s created\n",
				dbMainName,dbRegisteredIDs,urlID)
		}
		return true
	}

	if urlPath=="/dumpturn" {
		timeNow := time.Now()

		recentTurnCalleeIpMutex.Lock()
		for ipAddr := range recentTurnCalleeIps {
			turnCallee, ok := recentTurnCalleeIps[ipAddr]
			if ok {
				timeSinceCallerDisconnect := timeNow.Sub(turnCallee.TimeStored)
				printFunc(w,"/dumpturn calleeID=%s since caller disconnect %v\n",
					turnCallee.CalleeID, timeSinceCallerDisconnect.Seconds())
			}
		}
		recentTurnCalleeIpMutex.Unlock()
		return true
	}

	if urlPath=="/dumpping" {
		hubMapMutex.RLock()
		defer hubMapMutex.RUnlock()
		for calleeID := range hubMap {
			fmt.Fprintf(w,"/dumpping %-20s pingSent/pongReceived pingReceived/pongSent %v/%v %v/%v\n",
				calleeID,
				hubMap[calleeID].CalleeClient.pingSent,
				hubMap[calleeID].CalleeClient.pongReceived,
				hubMap[calleeID].CalleeClient.pingReceived,
				hubMap[calleeID].CalleeClient.pongSent)
		}
		return true
	}

	return false
}

var	adminlogBusy atombool.AtomBool
var t *tail.Tail

func adminlog(w http.ResponseWriter, r *http.Request) {
	if adminlogBusy.Get() {
		t.Stop()
		t.Cleanup()
		fmt.Printf("/adminlog force end\n")
		adminlogBusy.Set(false)
	}

	fmt.Printf("/adminlog start...\n")	// maybe show src-ip and ua
	logfile := "/var/log/syslog"
	seekInfo := tail.SeekInfo{-64*1024,io.SeekEnd}
	var err error
	t, err = tail.TailFile(logfile, tail.Config{Follow: true, ReOpen: true, Location: &seekInfo })
	if err!=nil {
		fmt.Printf("/adminlog err=%v\n",err)
		return
	}
	adminlogBusy.Set(true)
	linesTotal := 0
	lines := 0
	flush := 0
	noflush := 0
	inARowLines := 0
	ticker100ms := time.NewTicker(100*time.Millisecond)
	defer ticker100ms.Stop()
	for {
		select {
		case notifChan := <-t.Lines:
			if notifChan==nil {
				// this happens if we force-stop it with a reload/newstart
				//adminlogBusy.Set(false)
				return
			}
			line := *notifChan
			linesTotal++
			if line.Text=="" ||
			   strings.Index(line.Text," webcall")<0 ||
			   strings.Index(line.Text,"TLS handshake error")>=0 ||
			   strings.Index(line.Text,"csp-report")>=0 {
			} else {
				//fmt.Fprintf(w,"%s\n",line.Text)
				// filter out columns
				toks := strings.Split(line.Text, " ")
				if len(toks)>5 {
					// we only use toks[2] = hh:mm:ss and everything starting with toks[5]
					// we do not use:
					//   toks[0] = month, toks[1] = dayOfMonth, toks[3] = servername, toks[4] = process name
					idx := strings.Index(line.Text,toks[5])
					if idx>0 {
						logline := toks[2]+" "+line.Text[idx:]
						fmt.Fprintf(w,"%s\n",logline)
						lines++
						inARowLines++
					}
				}
			}

		case <-ticker100ms.C:
			if inARowLines>=1 {
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				} else {
					//noflush++
				}
				flush++
				inARowLines = 0
			} else {
				noflush++
			}

		case <-r.Context().Done():
			t.Stop()
			t.Cleanup()
			fmt.Printf("/adminlog end %d/%d %d/%d\n",lines,linesTotal,flush,noflush)
			adminlogBusy.Set(false)
			return
		}
	}
}

