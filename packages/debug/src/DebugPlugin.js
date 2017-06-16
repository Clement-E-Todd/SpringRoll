/**
 * @module Core
 * @namespace springroll
 */
(function()
{
    // Include classes
    var ApplicationPlugin = include('springroll.ApplicationPlugin'),
        Debug = include('springroll.Debug');

    /**
     * @class Application
     */
    var plugin = new ApplicationPlugin();

    // Init the animator
    plugin.setup = function()
    {
        /**
         * Enable the Debug class. After initialization, this
         * is a pass-through to Debug.enabled.
         * @property {Boolean} options.debug
         * @default true
         */
        this.options.add('debug', true);

        /**
         * Minimum log level from 0 to 4
         * @property {int} options.minLogLevel
         * @default 0
         */
        this.options.add('minLogLevel', 0);

        /**
         * The framerate container
         * @property {String|DOMElement} options.framerate
         */
        this.options.add('framerate');

        /**
         * The framerate container
         * @property {DOMElement} _framerate
         * @private
         */
        this._framerate = null;

        /**
         * The host computer for remote debugging, the debug
         * module must be included to use this feature. Can be an
         * IP address or host name. After initialization, setting
         * this will still connect or disconect Debug for remote
         * debugging. This is a write-only property.
         * @property {String} options.debugRemote
         */
        this.options.add('debugRemote', null)
            .respond('debug', function()
            {
                return Debug.enabled;
            })
            .on('debug', function(value)
            {
                Debug.enabled = value;
            })
            .on('debugRemote', function(value)
            {
                Debug.disconnect();
                if (value)
                {
                    Debug.connect(value);
                }
            })
            .respond('minLogLevel', function()
            {
                return Debug.minLogLevel.asInt;
            })
            .on('minLogLevel', function(value)
            {
                Debug.minLogLevel = Debug.Levels.valueFromInt(
                    parseInt(value, 10)
                );

                if (!Debug.minLogLevel)
                {
                    Debug.minLogLevel = Debug.Levels.GENERAL;
                }
            });
    };

    plugin.preload = function(done)
    {
        this.options.asDOMElement('framerate');
        var framerate = this.options.framerate;
        var display = this.display;

        if (!framerate && display)
        {
            var stage = display.canvas;
            framerate = document.createElement("div");
            framerate.id = "framerate";
            stage.parentNode.insertBefore(framerate, stage);
        }

        // Check for no framerate in the case of no display
        // and no option.framerate being set
        if (framerate)
        {
            this._framerate = framerate;

            // Set the default text
            framerate.innerHTML = "FPS: 00.000";

            var frameCount = 0;
            var framerateTimer = 0;

            this.on('update', function(elapsed)
                {
                    frameCount++;
                    framerateTimer += elapsed;

                    // Only update the framerate every second
                    if (framerateTimer >= 1000)
                    {
                        var fps = 1000 / framerateTimer * frameCount;
                        framerate.innerHTML = "FPS: " + fps.toFixed(3);
                        framerateTimer = 0;
                        frameCount = 0;
                    }
                })
                .on('resumed', function()
                {
                    frameCount = framerateTimer = 0;
                });
        }
        done();
    };

    // Destroy the animator
    plugin.teardown = function()
    {
        if (DEBUG)
        {
            this.off('update resumed');

            // Remove the framerate container
            var framerate = this._framerate;
            if (framerate && framerate.parentNode)
            {
                framerate.parentNode.removeChild(framerate);
            }
        }
        Debug.disconnect();
    };

}());