// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// All client activity starts in httpServer.go.
// The handlers "/callee/", "/user/" and "/button/" serve the 
// client software (HTML + Javascript).
// Once loaded by the user agent, the clients will send XHR requests
// to the "/rtcsig/" handler, implemented by httpApiHandler().

package main

import (
	"net/http"
	"time"
	"strings"
	"fmt"
	"strconv"
	"sort"
	"encoding/json"
	"os"
	"io"
	"math/rand"
	"path/filepath"
	"crypto/tls"
	"github.com/mehrvarz/webcall/skv"
)

func httpServer() {
	curdir, err := filepath.Abs(filepath.Dir(os.Args[0]))
	if err!=nil {
		fmt.Printf("# httpServer current dir not found err=(%v)\n", err)
		return
	}

	http.HandleFunc("/rtcsig/", httpApiHandler)

	http.HandleFunc("/callee/", substituteUserNameHandler)
	http.HandleFunc("/user/", substituteUserNameHandler)
	http.HandleFunc("/button/", substituteUserNameHandler)

	if htmlPath != "" {
		webroot := curdir + "/" + htmlPath
		fmt.Printf("httpServer htmlPath=%s fullPath=%s\n", htmlPath, webroot)
		http.Handle("/", http.FileServer(http.Dir(webroot)))
		/*
		// if we wanted to set a header before http.FileServer() we would use this
		setHeaderThenServe := func(h http.Handler) http.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) {
				readConfigLock.RLock()
				myCspString := cspString
				readConfigLock.RUnlock()
				if myCspString!="" {
					if logWantedFor("csp") {
						fmt.Printf("csp file (%s) (%s)\n", r.URL.Path, myCspString)
					}
					header := w.Header()
					header.Set("Content-Security-Policy", myCspString)
				}
				h.ServeHTTP(w, r)
			}
		}
		http.Handle("/", setHeaderThenServe(http.FileServer(http.Dir(webroot))))
		*/
	}

	if httpsPort>0 {
		httpsFunc := func() {
			addrPort := fmt.Sprintf(":%d",httpsPort)
			fmt.Printf("httpServer https listening on %v\n", addrPort)
			cer, err := tls.LoadX509KeyPair("tls.pem","tls.key")
			if err != nil {
				fmt.Printf("# httpServer tls.LoadX509KeyPair err=(%v)\n", err)
				os.Exit(-1)
			}
			tlsConfig := &tls.Config{
				Certificates: []tls.Certificate{cer},
				InsecureSkipVerify: insecureSkipVerify,
				// Causes servers to use Go's default ciphersuite preferences,
				// which are tuned to avoid attacks. Does nothing on clients.
				PreferServerCipherSuites: true,
				// Only use curves which have assembly implementations
				CurvePreferences: []tls.CurveID{
					tls.CurveP256,
					tls.X25519,
				},
				MinVersion: tls.VersionTLS12,
				CipherSuites: []uint16{
					tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
					tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
					tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
					tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
					tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
					tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
				},
			}
			tlsConfig.BuildNameToCertificate()
			srv := &http.Server{
				Addr: addrPort,
				ReadHeaderTimeout: 2 * time.Second,
				ReadTimeout: 5 * time.Second,
				WriteTimeout: 600 * time.Second,	// includes the header read and the first byte wait
				IdleTimeout: 30 * time.Second,
				//IdleConnTimeout: 60 * time.Second,
				//MaxIdleConns: 100, // TODO
				TLSConfig: tlsConfig,
			}
			err = srv.ListenAndServeTLS("","")
			if err != nil {
				fmt.Printf("# httpServer ListenAndServeTLS err=%v\n", err)
			} else {
				fmt.Printf("httpServer ListenAndServeTLS finished with no err\n")
			}
		}

		if httpPort>0 {
			// running a https server in addition to a http server (below)
			go func() {
				httpsFunc()
			}()
		} else {
			// no http server, running https server only
			httpsFunc()
		}
	}

	if httpPort>0 {
		addrPort := fmt.Sprintf(":%d",httpPort)
		fmt.Printf("httpServer http listening on %v\n", addrPort)
		srv := &http.Server{
			// this http.Server redirects to https
			Addr: addrPort,
			ReadTimeout:  5 * time.Second,
			WriteTimeout: 5 * time.Second,
			Handler: http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				w.Header().Set("Connection", "close")
				url := "https://" + req.Host + req.URL.String()
				http.Redirect(w, req, url, http.StatusMovedPermanently)
			}),
		}
		if !httpToHttps {
			srv = &http.Server{
				// this http.Server will NOT redirect to https
				Addr: addrPort,
				ReadHeaderTimeout: 2 * time.Second,
				ReadTimeout: 5 * time.Second,
				WriteTimeout: 600 * time.Second,	// from end of req header read to the end of the response write
				IdleTimeout: 30 * time.Second,
				//IdleConnTimeout: 60 * time.Second,
				//MaxIdleConns: 100, // TODO
			}
		}
		err = srv.ListenAndServe()
		fmt.Printf("# httpServer ListenAndServe err=%v\n", err)
	}
}

// substituteUserNameHandler will substitute r.URL.Path with "index.html"
// if the file described by r.URL.Path does not exist, 
// this way for "/callee/(username)" the following will be served: "/callee/index.html" 
// but the browser client's JS code can still evaluate "/callee/(username)"
func substituteUserNameHandler(w http.ResponseWriter, r *http.Request) {
	// serve file - if file does not exist, serve index.html
	urlPath := r.URL.Path
	if strings.HasSuffix(urlPath,"/") {
		urlPath = urlPath[:len(urlPath)-1]
	}

	remoteAddrWithPort := r.RemoteAddr
	if strings.HasPrefix(remoteAddrWithPort,"[::1]") {
		remoteAddrWithPort = "127.0.0.1"+remoteAddrWithPort[5:]
	}
	altIp := r.Header.Get("X-Real-IP")
	if len(altIp) >= 7 && !strings.HasPrefix(remoteAddrWithPort,altIp) {
		remoteAddrWithPort = altIp
	}
	remoteAddr := remoteAddrWithPort

	// deny bot's
	userAgent := r.UserAgent()
	if userAgent=="" || 
		strings.Index(userAgent, "bot") >= 0 ||
		strings.Index(userAgent, "spider") >= 0 ||
		strings.Index(userAgent, "scan") >= 0 ||
		strings.Index(userAgent, "search") >= 0 ||
		strings.Index(userAgent, "acebook") >= 0 ||
		strings.Index(userAgent, "WhatsApp") >= 0 ||
		strings.Index(userAgent, "Telegram") >= 0 {
		fmt.Printf("# substituteUserNameHandler bot denied path=(%s) userAgent=(%s) rip=%s\n",
			r.URL.Path, userAgent, remoteAddr)
		return
	}

	if strings.Index(urlPath,"..")>=0 {
		// suspicious! do not respond
		fmt.Printf("# substituteUserNameHandler abort on '..' in urlPath=(%s)\n", urlPath)
		return
	}
	curdir, err := filepath.Abs(filepath.Dir(os.Args[0]))
	if err!=nil {
		fmt.Printf("# substituteUserNameHandler current dir not found err=(%v)\n", err)
		return
	}
	//fmt.Printf("substitute curdir=(%s) root(%s) (url=%s)\n", curdir, htmlPath, urlPath)
	fullpath := curdir + "/webroot" + urlPath
	//fmt.Printf("substitute (%s)\n", fullpath)
	if _, err := os.Stat(fullpath); os.IsNotExist(err) {
		// fullpath does not exist
		idxLastSlash := strings.LastIndex(fullpath,"/")
		if idxLastSlash>=0 {
			fullpath = fullpath[:idxLastSlash+1] + "index.html"
			//fmt.Printf("substitute try (%s)\n", fullpath)
		}
	}
	if logWantedFor("http") {
		fmt.Printf("substituteUserNameHandler (%s) try (%s)\n", r.URL.Path, fullpath)
	}

	readConfigLock.RLock()
	myCspString := cspString
	readConfigLock.RUnlock()
	if myCspString!="" {
		if logWantedFor("csp") {
			fmt.Printf("csp sub (%s) (%s)\n", r.URL.Path, myCspString)
		}
		header := w.Header()
		header.Set("Content-Security-Policy", myCspString)
	}
	http.ServeFile(w, r, fullpath)
}

func httpApiHandler(w http.ResponseWriter, r *http.Request) {
	startRequestTime := time.Now()

	remoteAddrWithPort := r.RemoteAddr
	if strings.HasPrefix(remoteAddrWithPort,"[::1]") {
		remoteAddrWithPort = "127.0.0.1"+remoteAddrWithPort[5:]
	}
	altIp := r.Header.Get("X-Real-IP")
	if len(altIp) >= 7 && !strings.HasPrefix(remoteAddrWithPort,altIp) {
		remoteAddrWithPort = altIp
	}
	remoteAddr := remoteAddrWithPort
	idxPort := strings.Index(remoteAddrWithPort,":")
	if idxPort>=0 {
		remoteAddr = remoteAddrWithPort[:idxPort]
	}

	urlPath := r.URL.Path
	if strings.HasPrefix(urlPath,"/rtcsig/") {
		urlPath = urlPath[7:]
	}
	if logWantedFor("http") {
		fmt.Printf("httpApi (%v) tls=%v rip=%s\n", urlPath, r.TLS!=nil, remoteAddrWithPort)
	}

	// deny bot's
	userAgent := r.UserAgent()
	if userAgent=="" || 
		strings.Index(userAgent, "bot") >= 0 ||
		strings.Index(userAgent, "spider") >= 0 ||
		strings.Index(userAgent, "scan") >= 0 ||
		strings.Index(userAgent, "search") >= 0 ||
		strings.Index(userAgent, "acebook") >= 0 ||
		strings.Index(userAgent, "WhatsApp") >= 0 ||
		strings.Index(userAgent, "Telegram") >= 0 {
		fmt.Printf("# httpApi bot denied path=(%s) userAgent=(%s) rip=%s\n", r.URL.Path, userAgent, remoteAddr)
		return
	}

	// deny a remoteAddr to do more than X requests per 30min
	if maxClientRequestsPer30min>0 && remoteAddr!=outboundIP && remoteAddr!="127.0.0.1" {
		clientRequestsMutex.RLock()
		clientRequestsSlice,ok := clientRequestsMap[remoteAddr]
		clientRequestsMutex.RUnlock()
		if ok {
			for len(clientRequestsSlice)>0 {
				if time.Now().Sub(clientRequestsSlice[0]) < 30 * time.Minute {
					break
				}
				if len(clientRequestsSlice)>1 {
					clientRequestsSlice = clientRequestsSlice[1:]
				} else {
					clientRequestsSlice = clientRequestsSlice[:0]
				}
			}
			if len(clientRequestsSlice) >= maxClientRequestsPer30min {
				if logWantedFor("overload") {
					fmt.Printf("httpApi rip=%s %d >= %d requests/30m (%s)\n",
						remoteAddr, len(clientRequestsSlice), maxClientRequestsPer30min, urlPath)
				}
				fmt.Fprintf(w,"Too many requests in short order. Please take a pause.")
				clientRequestsMutex.Lock()
				clientRequestsMap[remoteAddr] = clientRequestsSlice
				clientRequestsMutex.Unlock()
				return
			}
		}
		clientRequestsSlice = append(clientRequestsSlice,time.Now())
		clientRequestsMutex.Lock()
		clientRequestsMap[remoteAddr] = clientRequestsSlice
		clientRequestsMutex.Unlock()
	}


	referer := r.Referer()
	refOptionsIdx := strings.Index(referer,"?")
	if refOptionsIdx>=0 {
		referer = referer[:refOptionsIdx]
	}

	// get calleeID from url-arg
	// note: a callee sends ?id=... to identify itself
	//       a caller sends ?id=... to request info about a callee, or send a notification to a callee
	calleeID := ""
	idxCalleeID := strings.Index(referer,"/callee/")
	if idxCalleeID>=0 && !strings.HasSuffix(referer,"/") {
		calleeID = strings.ToLower(referer[idxCalleeID+8:])
	}
	argIdx := strings.Index(calleeID,"&")
	if argIdx>=0 {
		calleeID = calleeID[0:argIdx]
	}

	urlID := "" // except for when we login with it, urlID is not our ID but of another party
	url_arg_array, ok := r.URL.Query()["id"]
	if ok && len(url_arg_array[0]) > 0 {
		urlID = strings.ToLower(url_arg_array[0])
		// urlID can be total garbage now
		if len(urlID)>11 {
			fmt.Printf("httpApi long urlID=(%s) ip=%s\n", urlID, remoteAddr)
		}
	} else {
		idxUserID := strings.Index(referer,"/user/")
		if idxUserID>=0 && !strings.HasSuffix(referer,"/") {
			urlID = referer[idxUserID+6:]
		} else {
			idxUserID = strings.Index(referer,"/button/")
			if idxUserID>=0 && !strings.HasSuffix(referer,"/") {
				urlID = referer[idxUserID+8:]
			}
		}
	}
	urlID = strings.TrimSpace(urlID)
	if logWantedFor("http") {
		fmt.Printf("httpApi (%s)\n", urlID)
	}

	nocookie := false
	url_arg_array, ok = r.URL.Query()["nocookie"]
	if ok {
		nocookie = true
	}

	//fmt.Printf("httpApi !calleeID=(%s) urlID=(%s) (raw:%s) (ref:%s)\n",
	//	calleeID, urlID, r.URL.String(), referer)
	cookieName := "webcallid"
	// use calleeID with cookieName only for answie#
	if urlID!="" && strings.HasPrefix(urlID,"answie") {
		cookieName = "webcallid-"+urlID
	}
	var pwIdCombo PwIdCombo
	pw := ""
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		// cookie not avail, not valid or disabled (which is fine for localhost requests)
		if logWantedFor("cookie") {
			// don't log for localhost 127.0.0.1 requests
			if remoteAddr!=outboundIP && remoteAddr!="127.0.0.1" {
				fmt.Printf("httpApi no cookie avail req=%s ref=%s cookieName=%s calleeID=%s urlID=%s err=%v\n",
					r.URL.Path, referer, cookieName, calleeID, urlID, err)
			}
		}
		cookie = nil
	} else {
		// cookie avail: could be a callee
		// could also be a client sending the cookie of a previous callee session

		// we should only show this if a callee is making use of the pw
		//maxlen:=20; if len(cookie.Value)<20 { maxlen=len(cookie.Value) }
		//fmt.Printf("httpApi cookie avail(%s) req=(%s) ref=(%s) callee=(%s)\n", 
		//	cookie.Value[:maxlen], r.URL.Path, referer, calleeID)

		// cookie.Value has format: calleeID + "&" + hashedPW
		idxAmpasent := strings.Index(cookie.Value,"&")
		if idxAmpasent<0 {
			fmt.Printf("# httpApi error no ampasent in cookie.Value (%s) clear cookie\n", cookie.Value)
			cookie = nil
		} else {
			calleeIdFromCookie := cookie.Value[:idxAmpasent]
			if calleeID=="" {
				// if we didn't get a calleeID from url-path, then use the one from cookie
				calleeID = calleeIdFromCookie
			}

			if calleeID!="" && calleeID != calleeIdFromCookie {
				fmt.Printf("# httpApi calleeID=(%s) != calleeIdFromCookie=(%s)\n", calleeID, calleeIdFromCookie)
				// WE NEED TO PREVENT THE LOGIN OF A 2ND CALLEE THAT IS NOT THE SAME AS THE ONE WHO OWNS THE COOKIE
				// THE OTHER CALLEE IS STOPPED AND IT'S COOKIE CLEARED BEFORE THIS ONE CAN LOGIN
				// RETURNING "ERROR" BRINGS UP THE PW FORM
				// but when /mode is used, the user is told that the other session needs to be stopped first
				fmt.Fprintf(w,"error")
				return
			}

			// calleeID == calleeIdFromCookie (this is good) - now get PW from kvHashedPw
			if logWantedFor("cookie") {
				fmt.Printf("httpApi cookie avail req=%s ref=%s cookieName=%s cValue=%s calleeID=%s urlID=%s\n",
					r.URL.Path, referer, cookieName, cookie.Value, calleeID, urlID)
			}
			err = kvHashedPw.Get(dbHashedPwBucket,cookie.Value,&pwIdCombo)
			if err!=nil {
				// callee is using an unknown cookie
				fmt.Printf("httpApi %v unknown cookie '%s' err=%v\n", r.URL, cookie.Value, err)
				// delete clientside cookie
				clearCookie(w, r, urlID, remoteAddr, "unknown cookie")
				cookie = nil
			} else {
				pwIdComboCalleeId := pwIdCombo.CalleeId
				argIdx := strings.Index(pwIdComboCalleeId,"&")
				if argIdx>=0 {
					pwIdComboCalleeId = pwIdComboCalleeId[0:argIdx]
					pwIdCombo.CalleeId = pwIdComboCalleeId
				}
				if calleeID!="" && pwIdCombo.CalleeId != calleeID {
					// callee is using wrong cookie
					fmt.Printf("# httpApi wrong cookie for id=(%s) != calleeID=(%s) clear cookie\n",
						pwIdCombo.CalleeId, calleeID)
					// delete clientside cookie
					clearCookie(w, r, urlID, remoteAddr, "wrong cookie")
					cookie = nil
				} else if pwIdCombo.Pw=="" {
					fmt.Printf("# httpApi cookie available, pw empty, pwIdCombo=(%v) ID=%s clear cookie\n",
						pwIdCombo, calleeID)
					// delete clientside cookie
					clearCookie(w, r, urlID, remoteAddr, "cookie pw empty")
					cookie = nil
				} else {
					//fmt.Printf("httpApi cookie available for id=(%s) (%s)(%s) reqPath=%s ref=%s rip=%s\n",
					//	pwIdCombo.CalleeId, calleeID, urlID, r.URL.Path, referer, remoteAddrWithPort)
					pw = pwIdCombo.Pw
				}
			}
		}
	}

	if urlPath=="/login" {
		httpLogin(w, r, urlID, cookie, pw, remoteAddr, remoteAddrWithPort,
				 nocookie, startRequestTime, pwIdCombo, userAgent)
		return
	}
	if urlPath=="/online" {
		httpOnline(w, r, urlID, remoteAddr)
		return
	}
	if urlPath=="/notifyCallee" {
		httpNotifyCallee(w, r, urlID, remoteAddr, remoteAddrWithPort)
		return
	}
	if urlPath=="/canbenotified" {
		httpCanbenotified(w, r, urlID, remoteAddr, remoteAddrWithPort)
		return
	}
	if urlPath=="/missedCall" {
		// TODO must be a caller that has just failed to connect to a callee
		// using: /online?id="+calleeID+"&wait=true
		// other clients are not accepted (to prevent unauthorized clients to fill this callees missed call list)
		httpMissedCall(w, r, urlID, remoteAddr, remoteAddrWithPort)
		return
	}
	if urlPath=="/getsettings" {
		httpGetSettings(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
	if urlPath=="/setsettings" {
		httpSetSettings(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
	if urlPath=="/action" {
		// TODO add cookie check
		httpActions(w, r, urlID, calleeID, remoteAddr)
		return
	}
	if strings.HasPrefix(urlPath,"/getcontacts") {
		httpGetContacts(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
	if strings.HasPrefix(urlPath,"/setcontact") {
		httpSetContacts(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
	if strings.HasPrefix(urlPath,"/deletecontact") {
		httpDeleteContact(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
	if strings.HasPrefix(urlPath,"/twid") {
		// TODO add cookie check
		httpTwId(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
	if strings.HasPrefix(urlPath,"/twfollower") {
		// TODO add cookie check
		httpTwFollower(w, r, urlID, calleeID, cookie, remoteAddr)
		return
	}
//	if strings.HasPrefix(urlPath,"/avail/") {
//		httpAvail(w, r, urlID, urlPath, remoteAddr)
//		return
//	}
	if strings.HasPrefix(urlPath,"/register/") {
		httpRegister(w, r, urlID, urlPath, remoteAddr, startRequestTime)
		return
	}
	if strings.HasPrefix(urlPath,"/newid") {
		httpNewId(w, r, urlID, calleeID, remoteAddr)
		return
	}
	if urlPath=="/mode" {
		if maintenanceMode {
			fmt.Printf("/mode maintenance rip=%s\n",remoteAddr)
			fmt.Fprintf(w,"maintenance")
			if logWantedFor("mode") {
				fmt.Printf("/mode maintenance (cookie:%s) (url:%s) rip=%s\n", calleeID, urlID, remoteAddr)
			}
			return
		}
		if cookie!=nil && pw!="" && calleeID==urlID {
			// if calleeID (from cookie) == urlID, then we do NOT need pw-entry on the client
			//fmt.Printf("/mode normal callee avail (cookie:%s) (url:%s) rip=%s\n",
			//	calleeID, urlID, remoteAddr)
			if logWantedFor("mode") {
				fmt.Printf("/mode normal|ok (cookie:%s) (url:%s) rip=%s\n", calleeID, urlID, remoteAddr)
			}
			fmt.Fprintf(w,"normal|ok")
			return
		}
		if logWantedFor("mode") {
			fmt.Printf("/mode normal (cookie:%s) (url:%s) rip=%s\n", calleeID, urlID, remoteAddr)
		}
		fmt.Fprintf(w,"normal")
		return
	}

	if urlPath=="/message" {
		// get message from post
		postBuf := make([]byte, 4096)
		length,_ := io.ReadFull(r.Body, postBuf)
		if length>0 {
			message := string(postBuf[:length])
			if strings.Index(message,"images/branding/product")>=0 {
				// skip this
			} else {
				fmt.Printf("/message=(%s)\n", message)
				// TODO here could send an email to admin
			}
		}
		return
	}

	if urlPath=="/logout" {
		clearCookie(w, r, urlID, remoteAddr, "/logout")
		return
	}
	if urlPath=="/version" {
		fmt.Fprintf(w, "version %s\nbuilddate %s\n",codetag,builddate)
		return
	}

	if remoteAddr=="127.0.0.1" || (outboundIP!="" && remoteAddr==outboundIP) {
		printFunc := func(w http.ResponseWriter, format string, a ...interface{}) {
			// printFunc writes to the console AND to the localhost http client
			fmt.Printf(format, a...)
			fmt.Fprintf(w, format, a...)
		}

		if urlPath=="/dumponline" {
			// show the list of callee-IDs that are online (and their ports)
			printFunc(w,"/dumponline rip=%s\n",remoteAddr)
			hubMapMutex.RLock()
			defer hubMapMutex.RUnlock()
			for calleeID,hub := range hubMap {
				//hub := hubMap[calleeID]
				if hub!=nil {
					hub.HubMutex.RLock()
					ua := ""
					remoteAddr := ""
					clientVersion := ""
					if hub.CalleeClient != nil {
						ua = hub.CalleeClient.userAgent
						remoteAddr = hub.CalleeClient.RemoteAddrNoPort
						clientVersion = hub.CalleeClient.clientVersion
					}
					if ua=="" {
						ua = hub.calleeUserAgent
					}
					boldString, _ := strconv.Unquote(`"\033[1m` + fmt.Sprintf("%-19s",calleeID) + `\033[0m"`)
					fmt.Fprintf(w,"%s ip=%-21s ws=%d caller=%-21s ver=%s ua=%s\n",
						boldString,
						remoteAddr,
						hub.WsClientID,
						hub.ConnectedCallerIp,
						clientVersion,
						ua)
					hub.HubMutex.RUnlock()
				}
			}
			printFunc(w,"\n")
			return
		}

		if urlPath=="/dumpLoginCount" {
			printFunc(w,"/dumpLoginCount rip=%s\n",remoteAddr)
			cleanupCalleeLoginMap(w,1,urlPath)
			return
		}

		if urlPath=="/dumpRequestCount" {
			printFunc(w,"/dumpRequestCount rip=%s\n",remoteAddr)
			cleanupClientRequestsMap(w,1,urlPath)
			return
		}

		if urlPath=="/hubinfo" {
			// show all hubs with the connected client
			printFunc(w,"/hubinfo rip=%s\n",remoteAddr)
			hubMapMutex.RLock()
			defer hubMapMutex.RUnlock()
			var hubinfoSlice []string
			for calleeID,hub := range hubMap {
				if hub!=nil {
					if hub.ConnectedCallerIp!="" {
						hubinfoSlice = append(hubinfoSlice,calleeID+" caller: "+hub.ConnectedCallerIp)
					} else {
						hubinfoSlice = append(hubinfoSlice,calleeID+" idle")
					}
				}
			}
			sort.Slice(hubinfoSlice, func(i, j int) bool {
				return hubinfoSlice[i] < hubinfoSlice[j]
			})
			for idx := range hubinfoSlice {
				fmt.Fprintln(w,hubinfoSlice[idx])
			}
			return
		}

		_, ok := kvMain.(skv.SKV)
		if !ok {
			// TODO log: httpAdmin() only works with local db
		} else {
			if httpAdmin(kvMain.(skv.SKV), w, r, urlPath, urlID, remoteAddr) {
				return
			}
		}
	}

	fmt.Printf("# [%s] (%s) unknown request rip=%s\n",urlPath,urlID,remoteAddr)
	return
}

func clearCookie(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, comment string) {
	cookieName := "webcallid"
	if strings.HasPrefix(urlID,"answie") {
		cookieName = "webcallid-"+urlID
	}
	cookie, err := r.Cookie(cookieName)
	if err == nil {
		fmt.Printf("clearcookie (%s) cookie.Value=%s ip=%s '%s'\n",
			urlID, cookie.Value, remoteAddr, comment)
		err = kvHashedPw.Delete(dbHashedPwBucket, cookie.Value)
		if err==nil {
			//fmt.Printf("clearCookie (%s) dbHashedPw.Delete OK db=%s bucket=%s key=%s\n",
			//	urlID, dbHashedPwName, dbHashedPwBucket, cookie.Value)
		} else {
			// user did logout without being logged in - never mind
			if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("clearCookie (%s) dbHashedPw.Delete db=%s bucket=%s key=%s err=%s\n",
					urlID, dbHashedPwName, dbHashedPwBucket, cookie.Value, err)
			}
		}
	} else {
		if strings.Index(err.Error(),"named cookie not present")<0 {
			fmt.Printf("# clearcookie (%s) ip=%s '%s' err=%s\n",
				urlID, remoteAddr, comment, err)
		}
	}
	//fmt.Printf("clearcookie (%s) ip=%s '%s'\n", urlID, remoteAddr, comment)
	expiration := time.Now().Add(-1 * time.Hour)
	cookieObj := http.Cookie{Name:cookieName, Value:"",
				Path:"/",
				HttpOnly:false,
				SameSite:http.SameSiteStrictMode,
				Expires:expiration}
	cookie = &cookieObj
	http.SetCookie(w, cookie)
	cookie = nil
}

func waitingCallerToCallee(calleeID string, waitingCallerSlice []CallerInfo, missedCalls []CallerInfo, hubclient *WsClient) {
	// TODO before we send the waitingCallerSlice, we should remove all elements that are older than 10min
	if waitingCallerSlice!=nil {
		//fmt.Printf("waitingCallerToCallee json.Marshal(waitingCallerSlice)...\n")
		jsonStr, err := json.Marshal(waitingCallerSlice)
		if err != nil {
			fmt.Printf("# waitingCallerToCallee (%s) failed on json.Marshal err=%v\n", calleeID,err)
		} else if hubclient==nil {
			fmt.Printf("# waitingCallerToCallee cannot send waitingCallers (%s) hubclient==nil\n", calleeID)
		} else {
			//fmt.Printf("waitingCallerToCallee send waitingCallers (%s) (%s) (%s)\n",
			//	calleeID, hubclient.hub.IsUnHiddenForCallerAddr, string(jsonStr))
			hubclient.Write([]byte("waitingCallers|"+string(jsonStr)))
		}
	}

	if missedCalls!=nil {
		//fmt.Printf("waitingCallerToCallee json.Marshal(missedCalls)...\n")
		jsonStr, err := json.Marshal(missedCalls)
		if err != nil {
			fmt.Printf("# waitingCallerToCallee (%s) failed on json.Marshal err=%v\n", calleeID,err)
		} else if hubclient==nil {
			fmt.Printf("# waitingCallerToCallee cannot send missedCalls (%s) hubclient==nil\n", calleeID)
		} else {
			//fmt.Printf("waitingCallerToCallee send missedCalls (callee=%s) (unHidden=%s)\n",
			//	calleeID, hubclient.hub.IsUnHiddenForCallerAddr)
			hubclient.Write([]byte("missedCalls|"+string(jsonStr)))
		}
	}
}

func getNewWsClientID() uint64 {
	// wsClientMutex must be locked outside
	for {
		var intID uint64 = uint64(rand.Int63n(int64(99999999999)))
		if(intID < uint64(10000000000)) {
			continue;
		}
		_,ok := wsClientMap[intID]
		if ok {
			// already in use
			continue
		}
		// wsClientMap[intID] is NOT in use yet
		return intID
	}
}

