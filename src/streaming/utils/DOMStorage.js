/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
import AbrController from '../controllers/AbrController.js';
import FactoryMaker from '../../core/FactoryMaker.js';

const LOCAL_STORAGE_VIDEO_BITRATE_KEY = "dashjs_vbitrate";
const LOCAL_STORAGE_AUDIO_BITRATE_KEY = "dashjs_abitrate";
const LOCAL_STORAGE_AUDIO_SETTINGS_KEY = "dashjs_asettings";
const LOCAL_STORAGE_VIDEO_SETTINGS_KEY = "dashjs_vsettings";
const DEFAULT_LOCAL_STORAGE_BITRATE_EXPIRATION = 360000;
const DEFAULT_LOCAL_STORAGE_MEDIA_SETTINGS_EXPIRATION = 360000;
const STORAGE_TYPE_LOCAL = "localStorage";
const STORAGE_TYPE_SESSION = "sessionStorage";
const BITRATE_EXPIRATION = 0;
const MEDIA_SETTINGS_EXPIRATION = 1;

let factory = FactoryMaker.getSingletonFactory(DOMStorage);

factory.STORAGE_TYPE_LOCAL = STORAGE_TYPE_LOCAL;
factory.STORAGE_TYPE_SESSION = STORAGE_TYPE_SESSION;
factory.LOCAL_STORAGE_VIDEO_BITRATE_KEY = LOCAL_STORAGE_VIDEO_BITRATE_KEY;
factory.LOCAL_STORAGE_AUDIO_BITRATE_KEY = LOCAL_STORAGE_AUDIO_BITRATE_KEY;
factory.LOCAL_STORAGE_AUDIO_SETTINGS_KEY = LOCAL_STORAGE_AUDIO_SETTINGS_KEY;
factory.LOCAL_STORAGE_VIDEO_SETTINGS_KEY = LOCAL_STORAGE_VIDEO_SETTINGS_KEY;

export default factory;

function DOMStorage() {

    let instance = {
        checkInitialBitrate :checkInitialBitrate,
        getSavedMediaSettings :getSavedMediaSettings,
        enableLastMediaSettingsCaching :enableLastMediaSettingsCaching,
        enableLastBitrateCaching :enableLastBitrateCaching,
        isSupported :isSupported,
        setConfig: setConfig
    }

    setup();
    return instance;

    let supported,
        abrController,
        lastBitrateCachingEnabled,
        lastMediaSettingsCachingEnabled,
        experationDict,
        log;

    function setConfig(config) {
        if (!config) return;

        if (config.log) {
            log = config.log;
        }
    }

    function setup() {
        experationDict = {
            BITRATE_EXPIRATION :DEFAULT_LOCAL_STORAGE_BITRATE_EXPIRATION,
            MEDIA_SETTINGS_EXPIRATION :DEFAULT_LOCAL_STORAGE_MEDIA_SETTINGS_EXPIRATION
        };
        lastBitrateCachingEnabled = true;
        lastMediaSettingsCachingEnabled = true;

        abrController = AbrController.getInstance();
    }

    function enableLastBitrateCaching(enable, ttl) {
        lastBitrateCachingEnabled = enable;
        setExpiration(BITRATE_EXPIRATION, ttl);
    }

    function enableLastMediaSettingsCaching(enable, ttl) {
        lastMediaSettingsCachingEnabled = enable;
        setExpiration(MEDIA_SETTINGS_EXPIRATION, ttl);
    }

    //type can be local, session
    function isSupported(type) {
        if (supported !== undefined) return supported;

        supported = false;

        var testKey = '1',
            testValue = "1",
            storage;

        try {
            storage = window[type];
        } catch (error) {
            log("Warning: DOMStorage access denied: " + error.message);
            return supported;
        }

        if (!storage || (type !== STORAGE_TYPE_LOCAL && type !== STORAGE_TYPE_SESSION)) {
            return supported;
        }

        /* When Safari (OS X or iOS) is in private browsing mode, it appears as though localStorage is available, but trying to call setItem throws an exception.
         http://stackoverflow.com/questions/14555347/html5-localstorage-error-with-safari-quota-exceeded-err-dom-exception-22-an

         Check if the storage can be used
         */
        try {
            storage.setItem(testKey, testValue);
            storage.removeItem(testKey);
            supported = true;
        } catch (error) {
            log("Warning: DOMStorage is supported, but cannot be used: " + error.message);
        }

        return supported;
    }

    function getSavedMediaSettings(type) {
        //Checks local storage to see if there is valid, non-expired media settings
        if (!isSupported(STORAGE_TYPE_LOCAL) || !lastMediaSettingsCachingEnabled) return null;

        var key = type === 'video' ? LOCAL_STORAGE_VIDEO_SETTINGS_KEY : LOCAL_STORAGE_AUDIO_SETTINGS_KEY,
            obj = JSON.parse(localStorage.getItem(key)) || {},
            isExpired = (new Date().getTime() - parseInt(obj.timestamp)) >= experationDict[MEDIA_SETTINGS_EXPIRATION] || false,
            settings = obj.settings;

        if (isExpired){
            localStorage.removeItem(key);
            settings = null;
        }

        return settings;
    }

    function checkInitialBitrate() {
        ['video', 'audio'].forEach(function(value) {
            //first make sure player has not explicitly set a starting bit rate
            if (abrController.getInitialBitrateFor(value) === undefined) {
                //Checks local storage to see if there is valid, non-expired bit rate
                //hinting from the last play session to use as a starting bit rate. if not,
                // it uses the default video and audio value in AbrController
                if (isSupported(STORAGE_TYPE_LOCAL) && lastBitrateCachingEnabled) {
                    var key = value === 'video' ? LOCAL_STORAGE_VIDEO_BITRATE_KEY : LOCAL_STORAGE_AUDIO_BITRATE_KEY,
                        obj = JSON.parse(localStorage.getItem(key)) || {},
                        isExpired = (new Date().getTime() - parseInt(obj.timestamp)) >= experationDict[BITRATE_EXPIRATION] || false,
                        bitrate = parseInt(obj.bitrate);

                    if (!isNaN(bitrate) && !isExpired) {
                        abrController.setInitialBitrateFor(value, bitrate);
                        log("Last bitrate played for "+value+" was "+bitrate);
                    } else if (isExpired){
                        localStorage.removeItem(key);
                    }
                }
                ////check again to see if local storage value was set, if not set default value for startup.
                //if (abrController.getInitialBitrateFor(value) === undefined) {//TODO-refactor need to not set const here!!!
                //    abrController.setInitialBitrateFor(value, AbrController["DEFAULT_"+value.toUpperCase()+"_BITRATE"]);
                //}
            }

        }, this);
    }

    function setExpiration(type, ttl) {
        if (ttl !== undefined && !isNaN(ttl) && typeof(ttl) === "number"){
            experationDict[type] = ttl;
        }
    }
};