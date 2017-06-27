import {Application, include, EventDispatcher, Enum} from '@springroll/core';
import SoundContext from './SoundContext';
import SoundInstance from './SoundInstance';
// @if DEBUG
import {Debug} from '@springroll/debug';
// @endif 

const WebAudioPlugin = include('createjs.WebAudioPlugin');
const CordovaAudioPlugin = include('createjs.CordovaAudioPlugin', false);
const FlashAudioPlugin = include('createjs.FlashAudioPlugin', false);
const SoundJS = include('createjs.Sound');

/**
 * Acts as a wrapper for SoundJS as well as adding lots of other functionality
 * for managing sounds.
 *
 * @class Sound
 * @extends springroll.EventDispatcher
 */
export default class Sound extends EventDispatcher
{
    constructor()
    {
        super();

        /**
         * Dictionary of sound objects, containing configuration info and playback objects.
         * @property {Object} _sounds
         * @private
         */
        this._sounds = {};

        /**
         * Array of SoundInstance objects that are being faded in or out.
         * @property {Array} _fades
         * @private
         */
        this._fades = [];

        /**
         * Array of SoundInstance objects waiting to be used.
         * @property {Array} _pool
         * @private
         */
        this._pool = [];

        /**
         * The extension of the supported sound type that will be used.
         * @property {string} supportedSound
         * @public
         */
        this.supportedSound = null;

        /**
         * Dictionary of SoundContexts.
         * @property {Object} _contexts
         * @private
         */
        this._contexts = {};

        //Bindings
        this._update = this._update.bind(this);
        this._markLoaded = this._markLoaded.bind(this);
        this._playAfterLoad = this._playAfterLoad.bind(this);

        /**
         * If sound is enabled. This will only be false if Sound was unable to initialize
         * a SoundJS plugin.
         * @property {Boolean} isSupported
         * @readOnly
         */
        this.isSupported = true;

        /**
         * If sound is currently muted by the system. This will only be true on iOS until
         * audio has been unmuted during a touch event. Listen for the 'systemUnmuted'
         * event on Sound to be notified when the audio is unmuted on iOS.
         * @property {Boolean} systemMuted
         * @readOnly
         */
        this.systemMuted = createjs.BrowserDetect.isIOS;

        /**
         * If preventDefault should be called on the interaction event that unmutes the audio.
         * In most cases (games) you would want to leave this, but for a website you may want
         * to disable it.
         * @property {Boolean} preventDefaultOnUnmute
         * @default true
         */
        this.preventDefaultOnUnmute = true;
    }

    /**
     * Fired when audio is unmuted on iOS. If systemMuted is false, this will not be fired
     * (or already has been fired).
     * @event systemUnmuted
     */
    static _fixAudioContext()
    {
        var activePlugin = SoundJS.activePlugin;
        //save audio data
        var _audioSources = activePlugin._audioSources;
        var _soundInstances = activePlugin._soundInstances;
        var _loaders = activePlugin._loaders;

        //close old context
        if (WebAudioPlugin.context.close)
        {
            WebAudioPlugin.context.close();
        }

        var AudioContext = window.AudioContext || window.webkitAudioContext;
        // Reset context
        WebAudioPlugin.context = new AudioContext();

        // Reset WebAudioPlugin
        WebAudioPlugin.call(activePlugin);

        // Copy over relevant properties
        activePlugin._loaders = _loaders;
        activePlugin._audioSources = _audioSources;
        activePlugin._soundInstances = _soundInstances;

        //update any playing instances to not have references to old audio nodes
        //while we could go through all of the springroll.Sound instances, it's probably
        //faster to go through SoundJS's stuff, as well as catching any cases where a
        //naughty person went over springroll.Sound's head and played audio through SoundJS
        //directly
        for (var url in _soundInstances)
        {
            var instances = _soundInstances[url];
            for (var i = 0; i < instances.length; ++i)
            {
                var instance = instances[i];
                //clean up old nodes
                instance.panNode.disconnect(0);
                instance.gainNode.disconnect(0);
                //make brand new nodes
                instance.gainNode = WebAudioPlugin.context.createGain();
                instance.panNode = WebAudioPlugin.context.createPanner();
                instance.panNode.panningModel = WebAudioPlugin._panningModel;
                instance.panNode.connect(instance.gainNode);
                instance._updatePan();
                //double check that the position is a valid thing
                if (instance._position < 0 || instance._position === undefined)
                {
                    instance._position = 0;
                }
            }
        }
    }

    /**
     * Initializes the Sound singleton. If using createjs.FlashAudioPlugin, you will
     * be responsible for setting createjs.FlashAudioPlugin.BASE_PATH.
     * @method init
     * @static
     * @param {Object|Function} options Either the options object or the ready function
     * @param {Array} [options.plugins=createjs.WebAudioPlugin,createjs.FlashAudioPlugin] The SoundJS
     * plugins to pass to createjs.Sound.registerPlugins().
     * @param {Array} [options.types=['ogg','mp3']] The order in which file types are
     * preferred, where "ogg" becomes a ".ogg" extension on all sound file urls.
     * @param {String} [options.swfPath='assets/swfs/'] The required path to the
     * createjs.FlashAudioPlugin SWF
     * @param {Function} [options.ready] A function to call when initialization is complete.
     * @return {Sound} The new instance of the sound object
     */
    static init(options, readyCallback)
    {
        var appOptions = Application.instance.options;

        //First argument is function
        if (typeof options === 'function')
        {
            options = {
                ready: options
            };
        }

        var defaultOptions = {
            plugins: FlashAudioPlugin ? [WebAudioPlugin, FlashAudioPlugin] : [WebAudioPlugin],
            types: ['ogg', 'mp3'],
            swfPath: 'assets/swfs/',
            ready: null
        };

        options = Object.assign({}, defaultOptions, options);

        if (appOptions.forceFlashAudio)
        {
            options.plugins = [FlashAudioPlugin];
        }

        if (CordovaAudioPlugin && (appOptions.forceNativeAudio || options.plugins.indexOf(CordovaAudioPlugin) >= 0))
        {
            // Security CORS error can be thrown when attempting to access window.top, wrapping the check in a try/catch block to prevent
            // the game from crashing where there is no CORS policy setup.
            try
            {
                var forceNativeAudio = (window.top) ? window.top.springroll.forceNativeAudio : window.springroll.forceNativeAudio;

                if (forceNativeAudio)
                {
                    options.plugins = [CordovaAudioPlugin];
                }
            }
            catch (e)
            {
                if (DEBUG && Debug)
                {
                    Debug.error('springroll.Sound.init cannot access window.top. Check for cross-origin permissions.');
                }
            }
        }

        //Check if the ready callback is the second argument
        //this is deprecated
        options.ready = options.ready || readyCallback;

        if (!options.ready)
        {
            throw 'springroll.Sound.init requires a ready callback';
        }

        if (FlashAudioPlugin)
        {
            //Apply the base path if available
            var basePath = appOptions.basePath;
            FlashAudioPlugin.swfPath = (basePath || '') + options.swfPath;
        }

        SoundJS.registerPlugins(options.plugins);

        //If on iOS, then we need to add a touch listener to unmute sounds.
        //playback pretty much has to be createjs.WebAudioPlugin for iOS
        //We cannot use touchstart in iOS 9.0 - http://www.holovaty.com/writing/ios9-web-audio/
        if (createjs.BrowserDetect.isIOS &&
            SoundJS.activePlugin instanceof WebAudioPlugin &&
            SoundJS.activePlugin.context.state !== 'running')
        {
            document.addEventListener('touchstart', Sound._playEmpty);
            document.addEventListener('touchend', Sound._playEmpty);
            document.addEventListener('mousedown', Sound._playEmpty);
        }
        else
        {
            this.systemMuted = false;
        }

        //New sound object
        Sound._instance = new Sound();

        //make sure the capabilities are ready (looking at you, Cordova plugin)
        if (SoundJS.getCapabilities())
        {
            Sound._instance._initComplete(options.types, options.ready);
        }
        else if (SoundJS.activePlugin)
        {
            if (DEBUG && Debug)
            {
                Debug.log('SoundJS Plugin ' + SoundJS.activePlugin + ' was not ready, waiting until it is');
            }
            //if the sound plugin is not ready, then just wait until it is
            var waitFunction;
            var waitResult;

            waitFunction = function()
            {
                // Security CORS error can be thrown when attempting to access window.top, wrapping the check in a try/catch block to prevent
                // the game from crashing where there is no CORS policy setup.
                try
                {
                    var NativeAudio = window.plugins.NativeAudio || window.top.plugins.NativeAudio || null;

                    if (NativeAudio)
                    {
                        NativeAudio.getCapabilities(function(result)
                        {
                            waitResult = result;

                            Application.instance.off('update', waitFunction);
                            Sound._instance._initComplete(options.types, options.ready);
                        }, function(result)
                        {
                            waitResult = result;

                            if (DEBUG && Debug)
                            {
                                Debug.error('Unable to get capabilities from Cordova Native Audio Plugin');
                            }
                        });
                    }
                }
                catch (e)
                {
                    if (DEBUG && Debug)
                    {
                        Debug.error('Cannot access window.top. Check for cross-origin permissions.');
                    }
                }
            };

            Application.instance.on('update', waitFunction);
        }
        else
        {
            if (DEBUG && Debug)
            {
                Debug.error('Unable to initialize SoundJS with a plugin!');
            }
            Sound._instance.isSupported = false;
            if (options.ready)
            {
                options.ready();
            }
        }
        return Sound._instance;
    }

    /**
     * Satisfies the iOS event needed to initialize the audio
     * Note that we listen on touchend as per http://www.holovaty.com/writing/ios9-web-audio/
     * @private
     * @method _playEmpty
     */
    static _playEmpty(ev)
    {
        WebAudioPlugin.playEmptySound();
        if (WebAudioPlugin.context.state === 'running' ||
            WebAudioPlugin.context.state === undefined)
        {
            if (Sound._instance.preventDefaultOnUnmute)
            {
                ev.preventDefault();
            }

            document.removeEventListener('touchstart', Sound._playEmpty);
            document.removeEventListener('touchend', Sound._playEmpty);
            document.removeEventListener('mousedown', Sound._playEmpty);

            Sound._instance.systemMuted = false;
            Sound._instance.trigger('systemUnmuted');
        }
    }

    /**
     * When the initialization as completed
     * @method
     * @private
     * @param {Array} filetypeOrder The list of files types
     * @param {Function} callback The callback function
     */
    _initComplete(filetypeOrder, callback)
    {
        if (FlashAudioPlugin && SoundJS.activePlugin instanceof FlashAudioPlugin)
        {
            Sound._instance.supportedSound = '.mp3';
        }
        else
        {
            var type;
            for (var i = 0, len = filetypeOrder.length; i < len; ++i)
            {
                type = filetypeOrder[i];
                if (SoundJS.getCapability(type))
                {
                    Sound._instance.supportedSound = '.' + type;
                    break;
                }
            }
        }
        //if on Android, using WebAudioPlugin, and the userAgent does not signify Firefox,
        //assume a Chrome based browser, so consider it a potential liability for the
        //bug in Chrome where the AudioContext is not restarted after too much silence
        this._fixAndroidAudio = createjs.BrowserDetect.isAndroid &&
            SoundJS.activePlugin instanceof WebAudioPlugin &&
            !(navigator.userAgent.indexOf('Gecko') > -1 &&
                navigator.userAgent.indexOf('Firefox') > -1);
        if (this._fixAndroidAudio)
        {
            this._numPlayingAudio = 0;
            this._lastAudioTime = Date.now();
        }

        if (callback)
        {
            callback();
        }
    }

    /**
     * The singleton instance of Sound.
     * @property {Sound} instance
     * @public
     * @static
     */
    get instance()
    {
        return Sound._instance;
    }

    /**
     * Loads a context config object. This should not be called until after Sound.init() is complete.
     * @method addContext
     * @public
     * @param {Object} config The config to load.
     * @param {String} [config.context] The optional sound context to load sounds into unless
     * otherwise specified by the individual sound. Sounds do not require a context.
     * @param {String} [config.path=""] The path to prepend to all sound source urls in this config.
     * @param {boolean} [config.preload=false] Option to preload all sound files in this context..
     * @param {Array} config.sounds The list of sounds, either as String ids or Objects with settings.
     * @param {Object|String} config.sounds.listItem Not actually a property called listItem,
     * but an entry in the array. If this is a string, then it is the same as {'id':'<yourString>'}.
     * @param {String} config.sounds.listItem.id The id to reference the sound by.
     * @param {String} [config.sounds.listItem.src] The src path to the file, without an
     * extension. If omitted, defaults to id.
     * @param {Number} [config.sounds.listItem.volume=1] The default volume for the sound, from 0 to 1.
     * @param {Boolean} [config.sounds.listItem.loop=false] If the sound should loop by
     * default whenever the loop parameter in play() is not specified.
     * @param {String} [config.sounds.listItem.context] A context name to override config.context with.
     * @param {Boolean} [config.sounds.listItem.preload] If the sound should be preloaded immediately.
     * @return {Sound} The sound object for chaining
     */
    addContext(config)
    {
        if (!config)
        {
            if (DEBUG && Debug)
            {
                Debug.warn('Warning - springroll.Sound was told to load a null config');
            }
            return;
        }
        var list = config.soundManifest || config.sounds || [];
        var path = config.path || '';
        var preloadAll = config.preload === true || false;
        var defaultContext = config.context;

        var s;
        var temp = {};
        for (var i = 0, len = list.length; i < len; ++i)
        {
            s = list[i];
            if (typeof s === 'string')
            {
                s = {
                    id: s
                };
            }
            temp = this._sounds[s.id] = {
                id: s.id,
                src: path + (s.src ? s.src : s.id) + this.supportedSound,
                volume: s.volume ? s.volume : 1,
                loop: !!s.loop,
                loadState: Sound.LoadStates.unloaded,
                playing: [],
                waitingToPlay: [],
                context: s.context || defaultContext,
                playAfterLoad: false,
                preloadCallback: null,
                data: s, //save data for potential use by SoundJS plugins
                duration: 0
            };
            if (temp.context)
            {
                if (!this._contexts[temp.context])
                {
                    this._contexts[temp.context] = new SoundContext(temp.context);
                }
                this._contexts[temp.context].sounds.push(temp);
            }
            //preload the sound for immediate-ish use
            if (preloadAll || s.preload === true)
            {
                this.preload(temp.id);
            }
        }
        //return the Sound instance for chaining
        return this;
    }

    /**
     * Links one or more sound contexts to another in a parent-child relationship, so
     * that the children can be controlled separately, but still be affected by
     * setContextMute(), stopContext(), pauseContext(), etc on the parent.
     * Note that sub-contexts are not currently affected by setContextVolume().
     * @method linkContexts
     * @param {String} parent The id of the SoundContext that should be the parent.
     * @param {String|Array} subContext The id of a SoundContext to add to parent as a
     *                                  sub-context, or an array of ids.
     * @return {Boolean} true if the sound exists, false otherwise.
     */
    linkContexts(parent, subContext)
    {
        if (!this._contexts[parent])
        {
            this._contexts[parent] = new SoundContext(parent);
        }
        parent = this._contexts[parent];

        if (Array.isArray(subContext))
        {
            for (var i = 0; i < subContext.length; ++i)
            {
                if (parent.subContexts.indexOf(subContext[i]) < 0)
                {
                    parent.subContexts.push(subContext[i]);
                }
            }
        }
        else
        {
            if (parent.subContexts.indexOf(subContext) < 0)
            {
                parent.subContexts.push(subContext);
            }
        }
    }

    /**
     * If a sound exists in the list of recognized sounds.
     * @method exists
     * @public
     * @param {String} alias The alias of the sound to look for.
     * @return {Boolean} true if the sound exists, false otherwise.
     */
    exists(alias)
    {
        return !!this._sounds[alias];
    }

    /**
     * If a context exists
     * @method contextExists
     * @public
     * @param {String} context The name of context to look for.
     * @return {Boolean} true if the context exists, false otherwise.
     */
    contextExists(context)
    {
        return !!this._contexts[context];
    }

    /**
     * If a sound is unloaded.
     * @method isUnloaded
     * @public
     * @param {String} alias The alias of the sound to look for.
     * @return {Boolean} true if the sound is unloaded, false if it is loaded, loading, or does not exist.
     */
    isUnloaded(alias)
    {
        return this._sounds[alias] ? this._sounds[alias].loadState === Sound.LoadStates.unloaded : false;
    }

    /**
     * If a sound is loaded.
     * @method isLoaded
     * @public
     * @param {String} alias The alias of the sound to look for.
     * @return {Boolean} true if the sound is loaded, false if it is not loaded or does not exist.
     */
    isLoaded(alias)
    {
        return this._sounds[alias] ? this._sounds[alias].loadState === Sound.LoadStates.loaded : false;
    }

    /**
     * If a sound is in the process of being loaded
     * @method isLoading
     * @public
     * @param {String} alias The alias of the sound to look for.
     * @return {Boolean} A value of true if the sound is currently loading, false if
     * it is loaded, unloaded, or does not exist.
     */
    isLoading(alias)
    {
        return this._sounds[alias] ? this._sounds[alias].loadState === Sound.LoadStates.loading : false;
    }

    /**
     * If a sound is playing.
     * @method isPlaying
     * @public
     * @param {String} alias The alias of the sound to look for.
     * @return {Boolean} A value of true if the sound is currently playing or loading
     * with an intent to play, false if it is not playing or does not exist.
     */
    isPlaying(alias)
    {
        var sound = this._sounds[alias];
        return sound ?
            sound.playing.length + sound.waitingToPlay.length > 0 :
            false;
    }

    /**
     * Gets the duration of a sound in milliseconds, if it has been loaded.
     * @method getDuration
     * @public
     * @param {String} alias The alias of the sound to look for.
     * @return {int|null} The duration of the sound in milliseconds. If the sound has
     * not been loaded, 0 is returned. If no sound exists by that alias, null is returned.
     */
    getDuration(alias)
    {
        var sound = this._sounds[alias];

        if (!sound) 
        {
            return null;
        }

        if (!sound.duration) //sound hasn't been loaded yet
        {
            if (sound.loadState === Sound.LoadStates.loaded)
            {
                //play the sound once to get the duration of it
                var channel = SoundJS.play(alias, null, null, null, null, /*volume*/ 0);
                sound.duration = channel.getDuration();
                //stop the sound
                channel.stop();
            }
        }

        return sound.duration;
    }

    /**
     * Fades a sound from 0 to a specified volume.
     * @method fadeIn
     * @public
     * @param {String|SoundInstance} aliasOrInst The alias of the sound to fade the
     * last played instance of, or an instance returned from play().
     * @param {Number} [duration=500] The duration in milliseconds to fade for.
     * The default is 500ms.
     * @param {Number} [targetVol] The volume to fade to. The default is the sound's default volume.
     * @param {Number} [startVol=0] The volume to start from. The default is 0.
     */
    fadeIn(aliasOrInst, duration, targetVol, startVol)
    {
        var sound, inst;
        if (typeof aliasOrInst === 'string')
        {
            sound = this._sounds[aliasOrInst];
            if (!sound)
            {
                return;
            }
            if (sound.playing.length)
            {
                inst = sound.playing[sound.playing.length - 1]; //fade the last played instance
            }
        }
        else
        {
            inst = aliasOrInst;
            sound = this._sounds[inst.alias];
        }
        if (!inst || !inst._channel)
        {
            return;
        }
        inst._fTime = 0;
        inst._fDur = duration > 0 ? duration : 500;
        inst._fEnd = targetVol || inst.curVol;
        inst._fStop = false;
        var v = startVol > 0 ? startVol : 0;
        inst.volume = inst._fStart = v;
        if (this._fades.indexOf(inst) === -1)
        {
            this._fades.push(inst);
            if (this._fades.length === 1)
            {
                Application.instance.on('update', this._update);
            }
        }
    }

    /**
     * Fades a sound from the current volume to a specified volume. A sound that ends
     * at 0 volume is stopped after the fade.
     * @method fadeOut
     * @public
     * @param {String|SoundInstance} aliasOrInst The alias of the sound to fade the
     * last played instance of, or an instance returned from play().
     * @param {Number} [duration=500] The duration in milliseconds to fade for.
     * The default is 500ms.
     * @param {Number} [targetVol=0] The volume to fade to. The default is 0.
     * @param {Number} [startVol] The volume to fade from. The default is the current volume.
     * @param {Boolean} [stopAtEnd] If the sound should be stopped when the fade completes. The
     *                              default is to stop it if the fade completes at a volume of 0.
     */
    fadeOut(aliasOrInst, duration, targetVol, startVol, stopAtEnd)
    {
        var sound, inst;
        if (typeof aliasOrInst === 'string')
        {
            sound = this._sounds[aliasOrInst];
            if (!sound)
            {
                return;
            }
            if (sound.playing.length)
            {
                //fade the last played instance
                inst = sound.playing[sound.playing.length - 1];
            }
            else if (s.loadState === Sound.LoadStates.loading)
            {
                this.stop(aliasOrInst);
                return;
            }
        }
        else
        {
            inst = aliasOrInst;
        }
        if (!inst || !inst._channel) 
        {
            return;
        }
        inst._fTime = 0;
        inst._fDur = duration > 0 ? duration : 500;
        if (startVol > 0)
        {
            inst.volume = startVol;
            inst._fStart = startVol;
        }
        else
        {
            inst._fStart = inst.volume;
        }
        inst._fEnd = targetVol || 0;
        stopAtEnd = stopAtEnd === undefined ? inst._fEnd === 0 : !!stopAtEnd;
        inst._fStop = stopAtEnd;
        if (this._fades.indexOf(inst) === -1)
        {
            this._fades.push(inst);
            if (this._fades.length === 1)
            {
                Application.instance.on('update', this._update);
            }
        }
    }

    /**
     * The update call, used for fading sounds. This is bound to the instance of Sound
     * @method _update
     * @private
     * @param {int} elapsed The time elapsed since the previous frame, in milliseconds.
     */
    _update(elapsed)
    {
        var fades = this._fades;

        var inst, time, sound, lerp, vol;
        for (var i = fades.length - 1; i >= 0; --i)
        {
            inst = fades[i];
            if (inst.paused)
            {
                continue;
            }
            time = inst._fTime += elapsed;
            if (time >= inst._fDur)
            {
                if (inst._fStop)
                {
                    sound = this._sounds[inst.alias];
                    if (sound) 
                    {
                        sound.playing.splice(sound.playing.indexOf(inst), 1);
                    }
                    this._stopInst(inst);
                }
                else
                {
                    inst.curVol = inst._fEnd;
                    inst.updateVolume();
                    fades.splice(i, 1);
                }
            }
            else
            {
                lerp = time / inst._fDur;
                if (inst._fEnd > inst._fStart)
                {
                    vol = inst._fStart + (inst._fEnd - inst._fStart) * lerp;
                }
                else
                {
                    vol = inst._fEnd + (inst._fStart - inst._fEnd) * lerp;
                }
                inst.curVol = vol;
                inst.updateVolume();
            }
        }
        if (fades.length === 0)
        {
            Application.instance.off('update', this._update);
        }
    }

    /**
     * Plays a sound.
     * @method play
     * @public
     * @param {String} alias The alias of the sound to play.
     * @param {Object|function} [options] The object of optional parameters or complete
     * callback function.
     * @param {Function} [options.complete] An optional function to call when the sound is finished.
     * @param {Function} [options.start] An optional function to call when the sound starts
     * playback. If the sound is loaded, this is called immediately, if not, it calls
     * when the sound is finished loading.
     * @param {Boolean} [options.interrupt=false] If the sound should interrupt previous
     * sounds (SoundJS parameter). Default is false.
     * @param {Number} [options.delay=0] The delay to play the sound at in milliseconds
     * (SoundJS parameter). Default is 0.
     * @param {Number} [options.offset=0] The offset into the sound to play in milliseconds
     * (SoundJS parameter). Default is 0.
     * @param {int} [options.loop=0] How many times the sound should loop. Use -1
     * (or true) for infinite loops (SoundJS parameter). Default is no looping.
     * @param {Number} [options.volume] The volume to play the sound at (0 to 1).
     * Omit to use the default for the sound.
     * @param {Number} [options.pan=0] The panning to start the sound at (-1 to 1).
     * Default is centered (0).
     * @return {SoundInstance} An internal SoundInstance object that can be used for
     * fading in/out as well as pausing and getting the sound's current position.
     */
    play(alias, options, startCallback, interrupt, delay, offset, loop, volume, pan)
    {
        var completeCallback;
        if (options && typeof options === 'function')
        {
            completeCallback = options;
            options = null;
        }
        completeCallback = (options ? options.complete : completeCallback) || null;
        startCallback = (options ? options.start : startCallback) || null;
        interrupt = !!(options ? options.interrupt : interrupt);
        delay = (options ? options.delay : delay) || 0;
        offset = (options ? options.offset : offset) || 0;
        loop = (options ? options.loop : loop);
        volume = (options ? options.volume : volume);
        pan = (options ? options.pan : pan) || 0;

        if (!this.isSupported)
        {
            if (completeCallback)
            {
                setTimeout(completeCallback, 0);
            }
            return;
        }

        //Replace with correct infinite looping.
        if (loop === true)
        {
            loop = -1;
        }
        var sound = this._sounds[alias];
        if (!sound)
        {
            if (DEBUG && Debug)
            {
                Debug.error('springroll.Sound: alias \'' + alias + '\' not found!');
            }
            if (completeCallback)
            {
                completeCallback();
            }
            return;
        }
        //check for sound loop settings
        if (sound.loop && loop === undefined || loop === null)
        {
            loop = -1;
        }
        //check for sound volume settings
        volume = (typeof(volume) === 'number') ? volume : sound.volume;
        //take action based on the sound state
        var loadState = sound.loadState;
        var inst, arr;
        if (loadState === Sound.LoadStates.loaded)
        {
            if (this._fixAndroidAudio)
            {
                if (this._numPlayingAudio)
                {
                    this._numPlayingAudio++;
                    this._lastAudioTime = -1;
                }
                else
                {
                    if (Date.now() - this._lastAudioTime >= 30000)
                    {
                        Sound._fixAudioContext();
                    }
                    this._numPlayingAudio = 1;
                    this._lastAudioTime = -1;
                }
            }
            //have Sound manage the playback of the sound
            var channel = SoundJS.play(alias, interrupt, delay, offset, loop, volume, pan);

            if (!channel || channel.playState === SoundJS.PLAY_FAILED)
            {
                if (completeCallback)
                {
                    completeCallback();
                }
                return null;
            }
            else
            {
                inst = this._getSoundInst(channel, sound.id);
                if (channel.handleExtraData)
                {
                    channel.handleExtraData(sound.data);
                }
                inst.curVol = volume;
                inst._pan = pan;
                sound.playing.push(inst);
                inst._endCallback = completeCallback;
                inst.updateVolume();
                inst.length = channel.getDuration();
                if (!sound.duration)
                {
                    sound.duration = inst.length;
                }
                inst._channel.addEventListener('complete', inst._endFunc);
                if (startCallback)
                {
                    setTimeout(startCallback, 0);
                }
                return inst;
            }
        }
        else if (loadState === Sound.LoadStates.unloaded)
        {
            sound.playAfterLoad = true;
            inst = this._getSoundInst(null, sound.id);
            inst.curVol = volume;
            inst._pan = pan;
            sound.waitingToPlay.push(inst);
            inst._endCallback = completeCallback;
            inst._startFunc = startCallback;
            if (inst._startParams)
            {
                arr = inst._startParams;
                arr[0] = interrupt;
                arr[1] = delay;
                arr[2] = offset;
                arr[3] = loop;
            }
            else
            {
                inst._startParams = [interrupt, delay, offset, loop];
            }
            this.preload(sound.id);
            return inst;
        }
        else if (loadState === Sound.LoadStates.loading)
        {
            //tell the sound to play after loading
            sound.playAfterLoad = true;
            inst = this._getSoundInst(null, sound.id);
            inst.curVol = volume;
            inst._pan = pan;
            sound.waitingToPlay.push(inst);
            inst._endCallback = completeCallback;
            inst._startFunc = startCallback;
            if (inst._startParams)
            {
                arr = inst._startParams;
                arr[0] = interrupt;
                arr[1] = delay;
                arr[2] = offset;
                arr[3] = loop;
            }
            else
            {
                inst._startParams = [interrupt, delay, offset, loop];
            }
            return inst;
        }
    }

    /**
     * Gets a SoundInstance, from the pool if available or maks a new one if not.
     * @method _getSoundInst
     * @private
     * @param {createjs.SoundInstance} channel A createjs SoundInstance to initialize the object
     *                                       with.
     * @param {String} id The alias of the sound that is going to be used.
     * @return {SoundInstance} The SoundInstance that is ready to use.
     */
    _getSoundInst(channel, id)
    {
        var rtn;
        if (this._pool.length)
        {
            rtn = this._pool.pop();
        }
        else
        {
            rtn = new SoundInstance();
            rtn._endFunc = this._onSoundComplete.bind(this, rtn);
        }
        rtn._channel = channel;
        rtn.alias = id;
        rtn.length = channel ? channel.getDuration() : 0; //set or reset this
        rtn.isValid = true;
        return rtn;
    }

    /**
     * Plays a sound after it finishes loading.
     * @method _playAfterload
     * @private
     * @param {String|Object} result The sound to play as an alias or load manifest.
     */
    _playAfterLoad(result)
    {
        var alias = typeof result === 'string' ? result : result.data.id;
        var sound = this._sounds[alias];
        sound.loadState = Sound.LoadStates.loaded;

        //If the sound was stopped before it finished loading, then don't play anything
        if (!sound.playAfterLoad) 
        {
            return;
        }

        if (this._fixAndroidAudio)
        {
            if (this._lastAudioTime > 0 && Date.now() - this._lastAudioTime >= 30000)
            {
                Sound._fixAudioContext();
            }
        }

        //Go through the list of sound instances that are waiting to start and start them
        var waiting = sound.waitingToPlay;

        var inst, startParams, volume, channel, pan;
        for (var i = 0, len = waiting.length; i < len; ++i)
        {
            inst = waiting[i];
            startParams = inst._startParams;
            volume = inst.curVol;
            pan = inst._pan;
            channel = SoundJS.play(
                alias,
                startParams[0], //interrupt
                startParams[1], //delay
                startParams[2], //offset
                startParams[3], //loop
                volume,
                pan
            );

            if (!channel || channel.playState === SoundJS.PLAY_FAILED)
            {
                if (DEBUG && Debug)
                {
                    Debug.error('Play failed for sound \'%s\'', alias);
                }
                if (inst._endCallback)
                {
                    inst._endCallback();
                }
                this._poolInst(inst);
            }
            else
            {
                if (this._fixAndroidAudio)
                {
                    if (this._numPlayingAudio)
                    {
                        this._numPlayingAudio++;
                        this._lastAudioTime = -1;
                    }
                    else
                    {
                        this._numPlayingAudio = 1;
                        this._lastAudioTime = -1;
                    }
                }

                sound.playing.push(inst);
                inst._channel = channel;
                if (channel.handleExtraData)
                {
                    channel.handleExtraData(sound.data);
                }
                inst.length = channel.getDuration();
                if (!sound.duration)
                {
                    sound.duration = inst.length;
                }
                inst.updateVolume();
                channel.addEventListener('complete', inst._endFunc);
                if (inst._startFunc)
                {
                    inst._startFunc();
                }
                if (inst.paused) //if the sound got paused while loading, then pause it
                {
                    channel.pause();
                }
            }
        }
        waiting.length = 0;
    }

    /**
     * The callback used for when a sound instance is complete.
     * @method _onSoundComplete
     * @private
     * @param {SoundInstance} inst The SoundInstance that is complete.s
     */
    _onSoundComplete(inst)
    {
        if (inst._channel)
        {
            if (this._fixAndroidAudio)
            {
                if (--this._numPlayingAudio === 0)
                {
                    this._lastAudioTime = Date.now();
                }
            }

            inst._channel.removeEventListener('complete', inst._endFunc);
            var sound = this._sounds[inst.alias];
            var index = sound.playing.indexOf(inst);
            if (index > -1)
            {
                sound.playing.splice(index, 1);
            }
            var callback = inst._endCallback;
            this._poolInst(inst);
            if (callback)
            {
                callback();
            }
        }
    }

    /**
     * Stops all playing or loading instances of a given sound.
     * @method stop
     * @public
     * @param {String} alias The alias of the sound to stop.
     */
    stop(alias)
    {
        var s = this._sounds[alias];
        if (!s) 
        {
            return;
        }
        if (s.playing.length)
        {
            this._stopSound(s);
        }
        else if (s.loadState === Sound.LoadStates.loading)
        {
            s.playAfterLoad = false;
            var waiting = s.waitingToPlay;
            var inst;
            for (var i = 0, len = waiting.length; i < len; ++i)
            {
                inst = waiting[i];
                this._poolInst(inst);
            }
            waiting.length = 0;
        }
    }

    /**
     * Stops all playing SoundInstances for a sound.
     * @method _stopSound
     * @private
     * @param {Object} s The sound (from the _sounds dictionary) to stop.
     */
    _stopSound(s)
    {
        var arr = s.playing;
        for (var i = arr.length - 1; i >= 0; --i)
        {
            this._stopInst(arr[i]);
        }
        arr.length = 0;
    }

    /**
     * Stops and repools a specific SoundInstance.
     * @method _stopInst
     * @private
     * @param {SoundInstance} inst The SoundInstance to stop.
     */
    _stopInst(inst)
    {
        if (inst._channel)
        {
            if (!inst.paused && this._fixAndroidAudio)
            {
                if (--this._numPlayingAudio === 0)
                {
                    this._lastAudioTime = Date.now();
                }
            }
            inst._channel.removeEventListener('complete', inst._endFunc);
            inst._channel.stop();
        }
        var fadeIdx = this._fades.indexOf(inst);
        if (fadeIdx > -1) 
        {
            this._fades.splice(fadeIdx, 1);
        }
        this._poolInst(inst);
    }

    /**
     * Stops all sounds in a given context.
     * @method stopContext
     * @public
     * @param {String} context The name of the context to stop.
     */
    stopContext(context)
    {
        context = this._contexts[context];
        if (context)
        {
            var arr = context.sounds;
            var s, i;
            for (i = arr.length - 1; i >= 0; --i)
            {
                s = arr[i];
                if (s.playing.length)
                {
                    this._stopSound(s);
                }
                else if (s.loadState === Sound.LoadStates.loading)
                {
                    s.playAfterLoad = false;
                }
            }
            for (i = 0; i < context.subContexts.length; ++i)
            {
                this.stopContext(context.subContexts[i]);
            }
        }
    }

    /**
     * Stop all sounds that are playing, regardless of context.
     * @method stopAll
     */
    stopAll()
    {
        for (var alias in this._sounds)
        {
            this.stop(alias);
        }
    }

    /**
     * Pauses a specific sound.
     * @method pause
     * @public
     * @param {String} alias The alias of the sound to pause.
     *     Internally, this can also be the object from the _sounds dictionary directly.
     */
    pause(sound, isGlobal)
    {
        if (typeof sound === 'string' )
        {
            sound = this._sounds[sound];
        }
        isGlobal = !!isGlobal;
        var arr = sound.playing;
        var i;
        for (i = arr.length - 1; i >= 0; --i)
        {
            if (!arr[i].paused)
            {
                arr[i].pause();
                arr[i].globallyPaused = isGlobal;
            }
        }
        arr = sound.waitingToPlay;
        for (i = arr.length - 1; i >= 0; --i)
        {
            if (!arr[i].paused)
            {
                arr[i].pause();
                arr[i].globallyPaused = isGlobal;
            }
        }
    }

    /**
     * Unpauses a specific sound.
     * @method resume
     * @public
     * @param {String} alias The alias of the sound to pause.
     *     Internally, this can also be the object from the _sounds dictionary directly.
     */
    resume(sound, isGlobal)
    {
        if (typeof sound === 'string')
        {
            sound = this._sounds[sound];
        }
        var arr = sound.playing;
        var i;
        for (i = arr.length - 1; i >= 0; --i)
        {
            if (arr[i].globallyPaused === isGlobal)
            {
                arr[i].resume();
            }
        }
        arr = sound.waitingToPlay;
        for (i = arr.length - 1; i >= 0; --i)
        {
            if (arr[i].globallyPaused === isGlobal)
            {
                arr[i].resume();
            }
        }
    }

    /**
     * Pauses all sounds in a given context. Audio paused this way will not be resumed with
     * resumeAll(), but must be resumed individually or with resumeContext().
     * @method pauseContext
     * @param {String} context The name of the context to pause.
     */
    pauseContext(context)
    {
        context = this._contexts[context];
        if (context)
        {
            var arr = context.sounds;
            var s, i;
            for (i = arr.length - 1; i >= 0; --i)
            {
                s = arr[i];
                var j;
                for (j = s.playing.length - 1; j >= 0; --j)
                {
                    s.playing[j].pause();
                }
                for (j = s.waitingToPlay.length - 1; j >= 0; --j)
                {
                    s.waitingToPlay[j].pause();
                }
            }
            for (i = 0; i < context.subContexts.length; ++i)
            {
                this.pauseContext(context.subContexts[i]);
            }
        }
    }

    /**
     * Resumes all sounds in a given context.
     * @method pauseContext
     * @param {String} context The name of the context to pause.
     */
    resumeContext(context)
    {
        context = this._contexts[context];
        if (context)
        {
            var arr = context.sounds;
            var s, i;
            for (i = arr.length - 1; i >= 0; --i)
            {
                s = arr[i];
                var j;
                for (j = s.playing.length - 1; j >= 0; --j)
                {
                    s.playing[j].resume();
                }
                for (j = s.waitingToPlay.length - 1; j >= 0; --j)
                {
                    s.waitingToPlay[j].resume();
                }
            }
            for (i = 0; i < context.subContexts.length; ++i)
            {
                this.resumeContext(context.subContexts[i]);
            }
        }
    }

    /**
     * Pauses all sounds.
     * @method pauseAll
     * @public
     */
    pauseAll()
    {
        var arr = this._sounds;
        for (var i in arr)
        {
            this.pause(arr[i], true);
        }
    }

    /**
     * Unpauses all sounds that were paused with pauseAll(). This does not unpause audio
     * that was paused individually or with pauseContext().
     * @method resumeAll
     * @public
     */
    resumeAll()
    {
        var arr = this._sounds;
        for (var i in arr)
        {
            this.resume(arr[i], true);
        }
    }

    _onInstancePaused()
    {
        if (this._fixAndroidAudio)
        {
            if (--this._numPlayingAudio === 0)
            {
                this._lastAudioTime = Date.now();
            }
        }
    }

    _onInstanceResume()
    {
        if (this._fixAndroidAudio)
        {
            if (this._lastAudioTime > 0 && Date.now() - this._lastAudioTime > 30000)
            {
                Sound._fixAudioContext();
            }

            this._numPlayingAudio++;
            this._lastAudioTime = -1;
        }
    }

    /**
     * Sets mute status of all sounds in a context
     * @method setContextMute
     * @public
     * @param {String} context The name of the context to modify.
     * @param {Boolean} muted If the context should be muted.
     */
    setContextMute(context, muted)
    {
        context = this._contexts[context];
        if (context)
        {
            context.muted = muted;
            var volume = context.volume;
            var arr = context.sounds;

            var s, playing, j, i;
            for (i = arr.length - 1; i >= 0; --i)
            {
                s = arr[i];
                if (s.playing.length)
                {
                    playing = s.playing;
                    for (j = playing.length - 1; j >= 0; --j)
                    {
                        playing[j].updateVolume(muted ? 0 : volume);
                    }
                }
            }
            for (i = 0; i < context.subContexts.length; ++i)
            {
                this.setContextMute(context.subContexts[i], muted);
            }
        }
    }

    /**
     * Set the mute status of all sounds
     * @property {Boolean} muteAll
     */
    set muteAll(muted)
    {
        SoundJS.setMute(!!muted);
    }

    /**
     * Sets volume of a context. Individual sound volumes are multiplied by this value.
     * @method setContextVolume
     * @public
     * @param {String} context The name of the context to modify.
     * @param {Number} volume The volume for the context (0 to 1).
     */
    setContextVolume(context, volume)
    {
        context = this._contexts[context];
        if (context)
        {
            var muted = context.muted;
            context.volume = volume;
            var arr = context.sounds;
            var s, playing, j;
            for (var i = arr.length - 1; i >= 0; --i)
            {
                s = arr[i];
                if (s.playing.length)
                {
                    playing = s.playing;
                    for (j = playing.length - 1; j >= 0; --j)
                    {
                        playing[j].updateVolume(muted ? 0 : volume);
                    }
                }
            }
        }
    }

    /**
     * Preloads a list of sounds.
     * @method preload
     * @public
     * @param {Array|String} list An alias or list of aliases to load.
     * @param {function} [callback] The function to call when all
     *      sounds have been loaded.
     */
    preload(list, callback)
    {
        if (!this.isSupported)
        {
            if (callback)
            {
                setTimeout(callback, 0);
            }
            return;
        }

        if (typeof list === 'string')
        {
            list = [list];
        }

        if (!list || list.length === 0)
        {
            if (callback) 
            {
                callback();
            }
            return;
        }

        var assets = [];
        var sound;
        for (var i = 0, len = list.length; i < len; ++i)
        {
            sound = this._sounds[list[i]];
            if (sound)
            {
                if (sound.loadState === Sound.LoadStates.unloaded)
                {
                    sound.loadState = Sound.LoadStates.loading;

                    //sound is passed last so that SoundJS gets the sound ID
                    assets.push(
                        {
                            id: sound.id,
                            src: sound.src,
                            complete: this._markLoaded,
                            data: sound,
                            advanced: true
                        });
                }
            }
            else if (DEBUG && Debug)
            {
                Debug.error('springroll.Sound was asked to preload ' + list[i] + ' but it is not a registered sound!');
            }
        }
        if (assets.length > 0)
        {
            Application.instance.load(assets, callback);
        }
        else if (callback)
        {
            callback();
        }
    }

    /**
     * Marks a sound as loaded. If it needs to play after the load, then it is played.
     * @method _markLoaded
     * @private
     * @param {String} alias The alias of the sound to mark.
     * @param {function} callback A function to call to show that the sound is loaded.
     */
    _markLoaded(result)
    {
        var alias = result.data.id;
        var sound = this._sounds[alias];
        if (sound)
        {
            sound.loadState = Sound.LoadStates.loaded;
            if (sound.playAfterLoad)
            {
                this._playAfterLoad(alias);
            }
        }
        var callback = sound.preloadCallback;
        if (callback)
        {
            sound.preloadCallback = null;
            callback();
        }
    }

    /**
     * Unloads a list of sounds to reclaim memory if possible.
     * If the sounds are playing, they are stopped.
     * @method unload
     * @public
     * @param {Array} list An array of sound aliases to unload.
     */
    unload(list)
    {
        if (!list) 
        {
            return;
        }

        var sound;
        for (var i = 0, len = list.length; i < len; ++i)
        {
            sound = this._sounds[list[i]];
            if (sound)
            {
                this._stopSound(sound);
                sound.loadState = Sound.LoadStates.unloaded;
            }
            SoundJS.removeSound(sound.src);
        }
    }

    /**
     * Unloads all sounds. If any sounds are playing, they are stopped.
     * Internally this calls `unload`.
     * @method unloadAll
     * @public
     */
    unloadAll()
    {
        var arr = [];
        for (var i in this._sounds)
        {
            arr.push(i);
        }
        this.unload(arr);
    }

    /**
     * Places a SoundInstance back in the pool for reuse.
     * @method _poolinst
     * @private
     * @param {SoundInstance} inst The instance to repool.
     */
    _poolInst(inst)
    {
        if (this._pool.indexOf(inst) === -1)
        {
            inst._endCallback = inst.alias = inst._channel = inst._startFunc = null;
            inst.curVol = 0;
            inst.globallyPaused = inst.paused = inst.isValid = false;
            this._pool.push(inst);
        }
    }

    /**
     * Destroys springroll.Sound. This unloads loaded sounds in SoundJS.
     * @method destroy
     * @public
     */
    destroy()
    {
        //Stop all sounds
        this.stopAll();

        //Remove all sounds from memeory
        SoundJS.removeAllSounds();

        //Remove the SWF from the page
        if (FlashAudioPlugin && SoundJS.activePlugin instanceof FlashAudioPlugin)
        {
            var swf = document.getElementById('SoundJSFlashContainer');
            if (swf && swf.parentNode)
            {
                swf.parentNode.removeChild(swf);
            }
        }

        Sound._instance = null;

        this._sounds = null;
        this._volumes = null;
        this._fades = null;
        this._contexts = null;
        this._pool = null;

        super.destroy();
    }
}

//sound states
Sound.LoadStates = new Enum('unloaded', 'loading', 'loaded');
