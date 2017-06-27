import {Application, EventDispatcher} from '@springroll/core';

/**
 * Keeps track of the user locale, by auto-detecting the browser language, allowing a user
 * selection, and automatically modifying any url that runs through the CacheManager.
 *
 * @class Languages
 * @extends springroll.EventDispatcher
 * @constructor
 */
export default class Languages extends EventDispatcher
{
    constructor()
    {
        super();

        /**
         * The value to replace with the current language in URLS.
         * @property {String} _replace
         * @private
         * @default "%LANG%"
         */
        this._replace = '%LANG%';

        /**
         * The current language.
         * @property {String} _current
         * @private
         */
        this._current = null;

        /**
         * The default language.
         * @property {String} _default
         * @private
         */
        this._default = null;

        /**
         * Available languages.
         * @property {Array} languages
         * @public
         */
        this.languages = null;

        /**
         * A dictionary of translated strings, set with setStringTable().
         * @property {Dictionary} _stringTable
         * @private
         */
        this._stringTable = null;
    }

    /**
     * Fired when the chosen language has changed.
     * @event changed
     * @param {String} language The newly chosen language.
     */

    /**
     * Configure 
     * @method setConfig
     * @param {Object} config The language settings to be used.
     * @param {String} config.default The default language name to use if asked for one that is
     *                              not present.
     * @param {Array} config.languages An array of all supported languages, with entries being
     *                               locale ids (dialects allowed). Locale ids should be lower
     *                               case.
     * @param {String} [config.replace="%LANG%"] A string to replace in urls with the current
     *                                          language.
     */
    setConfig(config)
    {
        if (!config.languages || !config.default)
        {
            throw 'Languages requires a language dictionary and a default language!';
        }

        this._replace = config.replace || this._replace;
        this._default = config.default;
        this.languages = config.languages;

        //set the initial language
        this.setLanguage(this.getPreferredLanguages());

        //connect to the CacheManager
        this.modifyUrl = this.modifyUrl.bind(this);
        Application.instance.loader.cacheManager.registerURLFilter(this.modifyUrl);
    }

    /**
     * The current language.
     * @property {String} current
     * @readOnly
     * @public
     */
    get current()
    {
        return this._current;
    }

    /**
     * Gets the preferred languages from the browser.
     * @method getPreferredLanguages
     * @return {Array} The list of preferred languages in order of preference.
     */
    getPreferredLanguages()
    {
        let result;
        const navigator = window.navigator;
        if (navigator.languages)
        {
            //use the newer Firefox and Chrome language list if available.
            result = navigator.languages;
        }
        else if (navigator.language)
        {
            //fall back to the browser's UI language
            result = [navigator.language || navigator.userLanguage];
        }
        else
        {
            result = [];
        }
        return result;
    }

    /**
     * Sets the current language, based on specified preferences and what is available.
     * @method setLanguage
     * @param {Array|String} languageList The list of preferred languages in order of preference,
     *                                or a single language.
     */
    setLanguage(languageList)
    {
        if (!languageList)
        {
            return;
        }

        if (!Array.isArray(languageList))
        {
            languageList = [languageList];
        }

        var chosen;
        for (var i = 0, len = languageList.length; i < len; ++i)
        {
            var language = languageList[i].toLowerCase();
            if (this.languages.indexOf(language) >= 0)
            {
                //check to see if we have the full language and dialect (if included)
                chosen = language;
                break;
            }
            else if (language.indexOf('-') >= 0)
            {
                //check to see if we have the language without the dialect
                language = language.split('-')[0].toLowerCase();
                if (this.languages.indexOf(language) >= 0)
                {
                    chosen = language;
                    break;
                }
            }
        }
        if (!chosen)
        {
            chosen = this._default;
        }
        if (chosen !== this._current)
        {
            this._current = chosen;
            this.trigger('changed', chosen);
        }
    }

    /**
     * Sets the string table for later reference.
     * @method setStringTable
     * @param {Dictionary} dictionary The string table, with keys that you would use to reference
     *                            the translations.
     */
    setStringTable(dictionary)
    {
        this._stringTable = dictionary;
    }

    /**
     * Gets a string from the current string table.
     * @method getString
     * @param {String} key The key of the string to get.
     * @return {String} The translated string.
     */
    getString(key)
    {
        return this._stringTable ? this._stringTable[key] : null;
    }

    /**
     * Gets a formatted string from the current string table. See String.format() in the Core
     * module.
     * @method getFormattedString
     * @param {String} key The key of the string to get.
     * @param {Array|*} args An array or list of arguments for formatting.
     * @return {String} The translated string.
     */
    getFormattedString(key)
    {
        var string = this._stringTable ? this._stringTable[key] : null;
        if (string)
        {
            return string.format(Array.prototype.slice.call(arguments, 1));
        }
        else
        {
            return null;
        }
    }

    /**
     * Modifies a url, replacing a specified value with the current language.
     * @method modifyUrl
     * @param {String} url The url to modify to a language specific version.
     */
    modifyUrl(url)
    {
        while (url.indexOf(this._replace) >= 0)
        {
            url = url.replace(this._replace, this._current);
        }
        return url;
    }

    /**
     * Destroys the Languages object.
     * @method destroy
     */
    destroy()
    {
        var loader = Application.instance.loader;
        if (loader)
        {
            loader.cacheManager.unregisterURLFilter(this.modifyUrl);
        }
        this.modifyUrl = this.languages = null;

        super.destroy();
    }
}
