// WebCall Copyright 2023 timur.mobi. All rights reserved.
package main

type DbEntry struct {
	StartTime int64
	Ip string				// calleeID
}

type DbUser struct {
	Name string             // nickname, if given
	Ip1 string              // used for httpRegister
	UserAgent string        // used for httpRegister
	MastodonID string
	//Str2 string           // web push device 1 subscription
	//Str2ua string         // web push device 1 user agent
	//Str3 string           // web push device 2 subscription
	//Str3ua string         // web push device 2 user agent
	AltIDs string
	LastLoginTime int64
	LastLogoffTime int64
	Int2 int                // bit 0 (&1): hidden callee mode
	                        // bit 1 (&2): -- not assigned --
	                        // bit 2 (&4): dialsounds muted
	                        // bit 3 (&8): main-link deactive
	                        // bit 4 (&16): mastodon-link deactive
	StoreContacts bool      // may also be encoded in Int2
	StoreMissedCalls bool	// may also be encoded in Int2
	MastodonSendTootOnCall bool
	AskCallerBeforeNotify bool
}

