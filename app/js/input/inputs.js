inp = new InputManager();

/* ********** */
/*  KEYBOARD  */
/* ********** */

const oldKeyValues = {};
let inputsArray = [];

try {
  const data = fs.readFileSync(inputsFilePath, "utf8");
  inputsArray = JSON.parse(data);
} catch (err) {
  console.error("Error reading or parsing inputs.json:", err);
}
Object.keys(inputsArray["keyboard"]["whenPressed"]).forEach((key) =>
  inp.removeDefaultEvent(key),
);
Object.keys(inputsArray["keyboard"]["whenDown"]).forEach((key) =>
  inp.removeDefaultEvent(key),
);

console.log(inputsArray["keyboard"]["whenPressed"]);

function updateKeyboard() {
  // Handle keys that trigger only once when pressed
  Object.keys(inputsArray["keyboard"]["whenPressed"]).forEach((key) => {
    if (inp.Get(key)) {
      if (!oldKeyValues[key]) {
        let callStr = inputsArray["keyboard"]["whenPressed"][key]; // e.g. "myFunc(-.1, 'str')"
        let func = new Function(`return (${callStr});`);
        func(); // Execute with real params
        oldKeyValues[key] = true;
      }
    } else {
      oldKeyValues[key] = false;
    }
  });

  // Handle keys that trigger continuously while held down
  Object.keys(inputsArray["keyboard"]["whenDown"]).forEach((key) => {
    if (inp.Get(key)) {
      let callStr = inputsArray["keyboard"]["whenDown"][key]; // e.g. "movePlayer(1, 'left')"
      let func = new Function(`return (${callStr});`);
      func();
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
    3: toggleInventory, // Triangle (PS) / Y (Xbox) → Open Inventory
    14: () => scrollHotbarSelection(-1), // D-Pad Left → Scroll Hotbar Left
    15: () => scrollHotbarSelection(1), // D-Pad Right → Scroll Hotbar Right
  };

  // Gamepad button mappings (activates when clicking and stop clickinng)
  const gamepadOn = {
    0: () => inp.SimulateMouseClick(0), // Cross (PS) / A (Xbox) → Simulate Left Click
    7: () => inp.SimulateMouseClick(0), // Right Trigger (R2) → Simulate Left Click
  };

  // Continuous actions (always active while button is held)
  const gamepadAlwaysOn = {
    12: () =>
      changeZoom(cursor.offsetLeft, cursor.offsetTop, Math.pow(scale, 0.1)), // D-Pad Up → Zoom In
    13: () =>
      changeZoom(cursor.offsetLeft, cursor.offsetTop, -Math.pow(scale, 0.1)), // D-Pad Down → Zoom Out
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
      oldGamePadValues[button] = !oldGamePadValues[button];
    }
  });
}

/* ************ */
/*  UPDATEFUNC  */
/* ************ */

function updateInputs() {
  updateKeyboard();
  requestAnimationFrame(updateInputs);
}
requestAnimationFrame(updateInputs);
