// inputManagement.js //

/*

all 'Input' objects

//
Get = ( bollean ) checks if key is pressed

Get('k') => checks if the 'k' key is pressed, can also be: 'cmd + k'

Get('shortcuts', 'save') => checks if the key(s) from the shortcuts, save keycombo (default: cmd + s)

//

Set(categoryOrFilePath, command, shortcut) => sets the shorcut into the inputs.json and the config

Delete()

//

updateKeys() => updates the keys in the config

*/

class InputManager {
  constructor() {
    this.inputConfig = null; // Configuration object
    this.lastPressedKeys = new Set(); // Track currently pressed keys
    this.mouseButtons = new Set(); // Track pressed mouse buttons
    this.gamepadButtons = new Set(); // Track gamepad button presses
    this.gamepadAxes = [0, 0, 0, 0]; // Track gamepad axes (left/right sticks)
    this.cleanedAxes = []; // turns the top one to [{x: 0, y: 0}, {x: 0, y: 0}, ...]
    this.simClickIndex = {};
    this.nonDefaultKeys = [];
    this.logKeyPress = false;

    this._setupEventListeners();
    this._startGamepadLoop();

    this.preventDefaultOnKey = [
      " ",
      "tab",
      "escape",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ];
  }

  // Set up event listeners for tracking keyboard & mouse inputs
  _setupEventListeners() {
    document.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      if (this.nonDefaultKeys.includes(key)) e.preventDefault();

      if (e.metaKey) {
        this.lastPressedKeys.add("cmd");
        if (this.logKeyPress) console.log(`super/command/windows key pressed`);
      }
      if (e.ctrlKey) {
        this.lastPressedKeys.add("ctrl");
        if (this.logKeyPress) console.log(`key "ctrl" pressed`);
      }
      if (e.shiftKey) {
        this.lastPressedKeys.add("shift");
        if (this.logKeyPress) console.log(`key "shift" pressed`);
      }
      if (e.altKey) {
        this.lastPressedKeys.add("alt");
        if (this.logKeyPress) console.log(`key "alt" pressed`);
      }

      if (this.logKeyPress) console.log(`Key "${key}" pressed`);
      if (this.preventDefaultOnKey.includes(key)) e.preventDefault();
      this.lastPressedKeys.add(key);
    });

    document.addEventListener("keyup", (e) => {
      const key = e.key.toLowerCase();
      this.lastPressedKeys.delete(key);
      if (!e.metaKey) this.lastPressedKeys.delete("cmd");
      if (!e.ctrlKey) this.lastPressedKeys.delete("ctrl");
      if (!e.shiftKey) this.lastPressedKeys.delete("shift");
      if (!e.altKey) this.lastPressedKeys.delete("alt");
    });

    document.addEventListener("mousedown", (e) => {
      const key = `m-${e.button}`;
      if (this.nonDefaultKeys.includes(key)) e.preventDefault();
      if (this.logKeyPress) console.log(`Mouse button "${e.button}" pressed`);
      this.mouseButtons.add(key);
    });

    document.addEventListener("contextmenu", (e) => {
      const key = `m-${e.button}`;
      if (this.nonDefaultKeys.includes(key)) e.preventDefault();
      if (this.logKeyPress) console.log(`Mouse button "${e.button}" pressed`);
    });

    document.addEventListener("mouseup", (e) => {
      const key = `m-${e.button}`;
      if (this.nonDefaultKeys.includes(key)) e.preventDefault();
      this.mouseButtons.delete(key);
    });

    window.addEventListener("blur", () => {
      this.lastPressedKeys.clear();
      this.mouseButtons.clear();
      this.gamepadButtons.clear();
    });
  }

  // Poll gamepad input in an update loop
  _startGamepadLoop() {
    const gamepadUpdate = () => {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        for (const pad of gamepads) {
          if (pad) {
            // Track pressed gamepad buttons
            this.gamepadButtons.clear();
            pad.buttons.forEach((btn, index) => {
              if (btn.pressed) {
                this.gamepadButtons.add(`g-${index}`);
                if (this.logKeyPress)
                  console.log(`Gamepad button "${index}" pressed`);
              }
            });

            // Track gamepad axes (left/right stick values)
            this.gamepadAxes = pad.axes;
          }
        }
      }
      requestAnimationFrame(gamepadUpdate);
    };
    gamepadUpdate();
  }

  removeDefaultEvent(key) {
    this.nonDefaultKeys.push(key);
  }

  // Check if any input is currently pressed
  KeyboardIsPressed() {
    return this.lastPressedKeys.size > 0;
  }

  GamePadIsPressed() {
    return this.gamepadButtons.size > 0;
  }

  MouseIsPressed() {
    return this.mouseButtons.size > 0;
  }

  AnyPressed() {
    return (
      this.lastPressedKeys.size > 0 ||
      this.mouseButtons.size > 0 ||
      this.gamepadButtons.size > 0
    );
  }

  // Get key, mouse button, or gamepad button state
  Get(input) {
    if (!input) return false;

    input = input.toLowerCase();

    // Check keyboard input
    if (input.includes("+")) {
      const keys = input.split(" + ").map((key) => key.trim());
      return keys.every((key) => this.lastPressedKeys.has(key));
    }

    // Check mouse buttons (e.g., "mouse0" for left click)
    if (input.startsWith("m-")) {
      return this.mouseButtons.has(input);
    }

    // Check gamepad buttons (e.g., "gamepad0" for A button)
    if (input.startsWith("g-")) {
      return this.gamepadButtons.has(input);
    }

    return this.lastPressedKeys.has(input);
  }

  // Get current mouse position
  GetMousePosition() {
    return [cursor.offsetLeft + 15, cursor.offsetTop + 15];
  }

  // Get gamepad axis values
  GetGamepadAxes() {
    this.cleanedAxes = [];
    for (let i = 0; i < this.gamepadAxes.length; i += 2) {
      this.cleanedAxes.push({
        x: this.gamepadAxes[i],
        y: this.gamepadAxes[i + 1],
      });
    }
    return this.cleanedAxes;
  }

  SimulateMouseClick(button = 0) {
    const mousePos = this.GetMousePosition();
    this.simClickIndex[button] = !this.simClickIndex[button];
    const simClick = this.simClickIndex[button];

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      clientX: mousePos[0],
      clientY: mousePos[1],
      button: button,
    };

    const targetElement = document.elementFromPoint(mousePos[0], mousePos[1]);
    if (targetElement) {
      if (simClick) {
        targetElement.dispatchEvent(new MouseEvent("mousedown", eventOptions));
        targetElement.dispatchEvent(new MouseEvent("click", eventOptions));
      }

      targetElement.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    }
  }
}
