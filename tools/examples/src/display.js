// Import modules
import {Graphics} from 'pixi.js';
import {Application} from '@springroll/core';
import '@springroll/display';

// Create the new springroll application
const app = new Application({
    display: { backgroundColor: 0x1e528c }
});

app.on('ready', function() {

    // Draw a circle using Pixi.js
    const shape = new Graphics()
        .beginFill(0x69a1df)
        .drawCircle(0, 0, 100);

    // Center in the middle of the stage
    shape.position.set(400, 300);

    // Render the shape
    app.display.stage.addChild(shape);

});