inp = new InputManager();

/* ********** */
/*  KEYBOARD  */
/* ********** */

const inputsFilePath = path.join(__dirname, 'js/input/inputs.json');

const oldKeyValues = {};
let inputsArray = [];

try {
    const data = fs.readFileSync(inputsFilePath, 'utf8');
    inputsArray = JSON.parse(data);
} catch (err) {
    console.error('Error reading or parsing inputs.json:', err);
}
Object.keys(inputsArray['keyboard']['whenPressed']).forEach((key) => inp.removeDefaultEvent(key));
Object.keys(inputsArray['keyboard']['whenDown']).forEach((key) => inp.removeDefaultEvent(key));

console.log(inputsArray['keyboard']['whenPressed']);


function updateKeyboard() {
    Object.keys(inputsArray['keyboard']['whenPressed']).forEach((key) => {
        // If the key is currently pressed
        if (inp.Get(key)) {
            // If it's the first time this key is pressed, trigger the action
            if (!oldKeyValues[key]) {
                const func = new Function(`return ${inputsArray['keyboard']['whenPressed'][key]}`)();
                func(); // Call the function associated with the key
                oldKeyValues[key] = true; // Mark the key as pressed
            }
        } else {
            // If key is released, reset the pressed state
            oldKeyValues[key] = false;
        }
    });

    Object.keys(inputsArray['keyboard']['whenDown']).forEach((key) => {
        if (inp.Get(key)) {
            const func = new Function(`return ${inputsArray['keyboard']['whenDown'][key]}`)();
                func(); // Call the function associated with the key
        }
    });
}

/* *********** */
/*   GAMEPAD   */
/* *********** */

const oldGamePadValues = {};

function updateGamepad() {
    const axes = inp.GetGamepadAxes();
    
    // Move using sticks
    if (Math.abs(axes[2]) > 0.1 || Math.abs(axes[3]) > 0.1) {
        move(-axes[2] * maxVelocity, -axes[3] * maxVelocity);
    }
    
    if (Math.abs(axes[0]) > 0.1 || Math.abs(axes[1]) > 0.1) {
        moveCursor(axes[0] * maxVelocity, axes[1] * maxVelocity);
    }

    // Gamepad button mappings (one-time actions)
    const gamepadActions = {
        '3': toggleInventory,  // Triangle (PS) / Y (Xbox) → Open Inventory
        '14': () => scrollHotbarSelection(-1), // D-Pad Left → Scroll Hotbar Left
        '15': () => scrollHotbarSelection(1)   // D-Pad Right → Scroll Hotbar Right
    };

    // Gamepad button mappings (activates when clicking and stop clickinng)
    const gamepadOn = {
        '0': () => inp.SimulateMouseClick(0),  // Cross (PS) / A (Xbox) → Simulate Left Click
        '7': () => inp.SimulateMouseClick(0),  // Right Trigger (R2) → Simulate Left Click
    }

    // Continuous actions (always active while button is held)
    const gamepadAlwaysOn = {
        '12': () => changeZoom(cursor.offsetLeft, cursor.offsetTop, Math.pow(scale, 0.1) ),  // D-Pad Up → Zoom In
        '13': () => changeZoom(cursor.offsetLeft, cursor.offsetTop, -Math.pow(scale, 0.1) )  // D-Pad Down → Zoom Out
    };

    // Handle one-time button actions
    Object.keys(gamepadActions).forEach((button) => {
        if (inp.Get(`g-${button}`)) {
            if (!oldGamePadValues[button]) {
                gamepadActions[button]();
                oldGamePadValues[button] = true;
            }
        } else {
            oldGamePadValues[button] = false;
        }
    });

    // Handle always-on actions
    Object.keys(gamepadAlwaysOn).forEach((button) => {
        if (inp.Get(`g-${button}`)) {
            gamepadAlwaysOn[button](); // Runs every frame while held
        }
    });

    // Handle one-time button actions
    Object.keys(gamepadOn).forEach((button) => {
        if (inp.Get(`g-${button}`) !== oldGamePadValues[button]) {
            gamepadOn[button]();
            oldGamePadValues[button] = !oldGamePadValues[button]
        }
    });
}


/* ************ */
/*  UPDATEFUNC  */
/* ************ */

function updateInputs() {
    updateKeyboard();
    requestAnimationFrame(updateInputs);
} requestAnimationFrame(updateInputs);
