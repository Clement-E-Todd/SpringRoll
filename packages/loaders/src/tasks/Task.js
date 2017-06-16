/**
 * @module Core
 * @namespace springroll
 */
(function()
{
    var Debug,
        Application = include('springroll.Application');

    /**
     * Internal class for dealing with async load assets
     * @class Task
     * @constructor
     * @private
     * @param {Object} asset The asset data
     * @param {String} [asset.id=null] The task ID
     * @param {Boolean} [asset.cache=false] If we should cache the result
     * @param {Function} [asset.complete=null] Call when complete
     * @param {String} fallbackId The ID to set if no ID is explicitly set
     *      this can be used for caching something that has no id
     * @param {Object} [asset.sizes=null] Define if certain sizes are not supported.
     */
    var Task = function(asset, fallbackId)
    {
        if (Debug === undefined)
        {
            Debug = include("springroll.Debug", false);
        }

        /**
         * The current status of the task (waiting, running, etc)
         * @property {int} status
         * @default 0
         */
        this.status = Task.WAITING;

        /**
         * The user call to fire when completed, returns the arguments
         * result, original, and additionalAssets
         * @property {Function} complete
         * @default null
         * @readOnly
         */
        this.complete = asset.complete || null;

        /**
         * If we should cache the load and use later
         * @property {Boolean} cache
         * @default false
         * @readOnly
         */
        this.cache = !!asset.cache;

        /**
         * The task id
         * @property {String} id
         */
        this.id = asset.id || null;

        /**
         * The task type for display filter
         * @property {String} type
         */
        this.type = asset.type || null;

        /**
         * Reference to the original asset data
         * @property {Object} original
         * @readOnly
         */
        this.original = asset;

        // We're trying to cache but we don't have an ID
        if (this.cache && !this.id)
        {
            if (fallbackId && typeof fallbackId == "string")
            {
                // Remove the file extension
                var extIndex = fallbackId.lastIndexOf('.');
                if (extIndex > -1)
                {
                    fallbackId = fallbackId.substr(0, extIndex);
                }

                // Check for the last folder slash then remove it
                var slashIndex = fallbackId.lastIndexOf('/');
                if (slashIndex > -1)
                {
                    fallbackId = fallbackId.substr(slashIndex + 1);
                }

                // Update the id
                asset.id = this.id = fallbackId;
            }

            // Check for ID if we're caching
            if (!this.id)
            {
                if (DEBUG && Debug)
                {
                    Debug.error("Caching an asset requires an id, none set", asset);
                }
                this.cache = false;
            }
        }
    };

    // Reference to prototype
    var p = extend(Task);

    /**
     * Status for waiting to be run
     * @property {int} WAITING
     * @static
     * @readOnly
     * @final
     * @default 0
     */
    Task.WAITING = 0;

    /**
     * Task is currently being run
     * @property {int} RUNNING
     * @static
     * @readOnly
     * @final
     * @default 1
     */
    Task.RUNNING = 1;

    /**
     * Status for task is finished
     * @property {int} FINISHED
     * @static
     * @readOnly
     * @final
     * @default 2
     */
    Task.FINISHED = 2;

    /**
     * Start the task
     * @method  start
     * @param  {Function} callback Callback when finished
     */
    p.start = function(callback)
    {
        callback();
    };

    /**
     * Add the sizing to each filter
     * @method filter
     * @protected
     * @param {String} url The url to filter
     */
    p.filter = function(url)
    {
        var sizes = Application.instance.assetManager.sizes;

        // See if we should add sizing
        if (url && sizes.test(url))
        {
            // Get the current size supported by this asset
            var size = sizes.size(this.original.sizes);

            // Update the URL size token
            url = sizes.filter(url, size);

            // Pass along the scale to the original asset data
            this.original.scale = size.scale;
        }
        return url;
    };

    /**
     * Pass-through to the Application load method
     * @method load
     * @protected
     * @param {String|Array|Object} source The source to load
     * @param {Object|Function} [options] The load options or callback function
     */
    p.load = function(source, options)
    {
        return Application.instance.load(source, options);
    };

    /**
     * Pass-through to the Application Loader.load
     * @method simpleLoad
     * @protected
     * @param {String} url Path to file to load
     * @param {Function} complete The callback
     * @param {Function} [progress] The load progress
     * @param {Object} [data] Additiona data
     */
    p.simpleLoad = function(url, complete, progress, data)
    {
        return Application.instance.loader.load(url, complete, progress, data);
    };

    /**
     * Destroy this and discard
     * @method destroy
     */
    p.destroy = function()
    {
        this.status = Task.FINISHED;
        this.id = null;
        this.type = null;
        this.complete = null;
        this.original = null;
    };

    // Assign to namespace
    namespace('springroll').Task = Task;

}());