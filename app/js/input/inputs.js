inp = new InputManager();

/* ********** */
/*  KEYBOARD  */
/* ********** */

const oldKeyValues = {};
let inputsArray = [];

try {
  const data = fs.readFileSync(inputsFilePath, "utf8");
  inputsArray = JSON.parse(data);
  inp.logKeyPress = inputsArray["opts"]["logKeyPress"];
} catch (err) {
  console.error("Error reading or parsing inputs.json:", err);
}
Object.keys(inputsArray["keyboard"]["whenPressed"]).forEach((key) =>
  inp.removeDefaultEvent(key),
);
Object.keys(inputsArray["keyboard"]["whenDown"]).forEach((key) =>
  inp.removeDefaultEvent(key),
);

Object.keys(inputsArray["gamepad"]["whenPressed"]).forEach((key) => {
  key = handleGamepadInputNames(key, "whenPressed");
  inp.removeDefaultEvent(key);
});
Object.keys(inputsArray["gamepad"]["whenDown"]).forEach((key) => {
  key = handleGamepadInputNames(key, "whenDown");
  inp.removeDefaultEvent(key);
});
Object.keys(inputsArray["gamepad"]["whenUpOrDown"]).forEach((key) => {
  key = handleGamepadInputNames(key, "whenUpOrDown");
  inp.removeDefaultEvent(key);
});

Object.keys(inputsArray["mouse"]["whenPressed"]).forEach((key) =>
  inp.removeDefaultEvent(key),
);
Object.keys(inputsArray["mouse"]["whenDown"]).forEach((key) =>
  inp.removeDefaultEvent(key),
);

function handleGamepadInputNames(key, secondStatement) {
  let lowerdKey = key.toLowerCase();
  if (lowerdKey === "rightaxe" || lowerdKey === "raxe") {
    inputsArray["gamepad"][secondStatement]["axes[1]"] =
      inputsArray["gamepad"][secondStatement][key];
    delete inputsArray["gamepad"][secondStatement][key];
    return "axes[0]";
  } else if (lowerdKey === "leftaxe" || lowerdKey === "laxe") {
    inputsArray["gamepad"][secondStatement]["axes[0]"] =
      inputsArray["gamepad"][secondStatement][key];
    delete inputsArray["gamepad"][secondStatement][key];
    return "axes[1]";
  } else if (lowerdKey === "upaxe" || lowerdKey === "uaxe") {
    inputsArray["gamepad"][secondStatement]["axes[2]"] =
      inputsArray["gamepad"][secondStatement][key];
    delete inputsArray["gamepad"][secondStatement][key];
    return "axes[2]";
  } else if (lowerdKey === "downaxe" || lowerdKey === "daxe") {
    inputsArray["gamepad"][secondStatement]["axes[3]"] =
      inputsArray["gamepad"][secondStatement][key];
    delete inputsArray["gamepad"][secondStatement][key];
    return "axes[3]";
  } else {
    return key;
  }
}

const gamePadDeadzone = inputsArray["gamepad"]["deadzone"];

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

/* ********** */
/*   MOUSE    */
/* ********** */

function updateMouse() {
  // Handle keys that trigger only once when pressed
  Object.keys(inputsArray["mouse"]["whenPressed"]).forEach((key) => {
    let keyName = `m-${key}`;
    if (inp.Get(keyName)) {
      if (!oldKeyValues[keyName]) {
        let callStr = inputsArray["mouse"]["whenPressed"][key]; // e.g. "myFunc(-.1, 'str')"
        let func = new Function(`return (${callStr});`);
        func(); // Execute with real params
        oldKeyValues[keyName] = true;
      }
    } else {
      oldKeyValues[keyName] = false;
    }
  });

  // Handle keys that trigger continuously while held down
  Object.keys(inputsArray["mouse"]["whenDown"]).forEach((key) => {
    let keyName = `m-${key}`;
    if (inp.Get(keyName)) {
      let callStr = inputsArray["mouse"]["whenDown"][key]; // e.g. "movePlayer(1, 'left')"
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

  // Handle keys that trigger only once when pressed
  Object.keys(inputsArray["gamepad"]["whenPressed"]).forEach((key) => {
    let shouldTrigger = false;
    let value = { x: 0, y: 0 };
    let keyName = `g-${key}`;

    if (key.startsWith("axes[")) {
      let axeNumber = parseInt(key.substring(5, key.length - 1));
      value = axes[axeNumber];
      if (Math.abs(value.x) < gamePadDeadzone) value.x = 0;
      if (Math.abs(value.y) < gamePadDeadzone) value.y = 0;

      shouldTrigger = (value.x > 0 || value.y > 0) && !oldKeyValues[keyName];
      if (value.x > 0 || value.y > 0) oldKeyValues[keyName] = true;
      else oldKeyValues[keyName] = false;
    } else {
      shouldTrigger = inp.Get(keyName) && !oldKeyValues[keyName];
    }

    if (shouldTrigger) {
      let callStr = inputsArray["gamepad"]["whenPressed"][key];
      callStr = callStr
        .replace(/value\.x/g, value.x)
        .replace(/value\.y/g, value.y);
      let func = new Function(`return (${callStr});`);
      func();
      oldKeyValues[keyName] = true;
    } else if (!key.startsWith("axes[") && !inp.Get(`g-${key}`)) {
      oldKeyValues[keyName] = false;
    }
  });

  // Handle always-on actions
  Object.keys(inputsArray["gamepad"]["whenDown"]).forEach((key) => {
    let shouldTrigger = false;
    let value = { x: 0, y: 0 };
    let keyName = `g-${key}`;

    if (key.startsWith("axes[")) {
      let axeNumber = parseInt(key.substring(5, key.length - 1));
      value = axes[axeNumber];
      if (Math.abs(value.x) < gamePadDeadzone) value.x = 0;
      if (Math.abs(value.y) < gamePadDeadzone) value.y = 0;
      shouldTrigger = value.x > 0 || value.y > 0;
    } else {
      shouldTrigger = inp.Get(keyName);
    }

    if (shouldTrigger) {
      let callStr = inputsArray["gamepad"]["whenDown"][key];
      callStr = callStr
        .replace(/value\.x/g, value.x)
        .replace(/value\.y/g, value.y);
      let func = new Function(`return (${callStr});`);
      func();
    }
  });

  // Handle always-on actions
  Object.keys(inputsArray["gamepad"]["whenUpOrDown"]).forEach((key) => {
    let shouldTrigger = false;
    let value = { x: 0, y: 0 };
    let keyName = `g-${key}`;

    if (key.startsWith("axes[")) {
      let axeNumber = parseInt(key.substring(5, key.length - 1));
      value = axes[axeNumber];
      if (Math.abs(value.x) < gamePadDeadzone) value.x = 0;
      if (Math.abs(value.y) < gamePadDeadzone) value.y = 0;
      shouldTrigger = (value.x > 0 || value.y > 0) !== !oldKeyValues[key];
    } else {
      shouldTrigger = inp.Get(keyName) !== !oldKeyValues[key];
    }

    if (shouldTrigger) {
      let callStr = inputsArray["gamepad"]["whenUpOrDown"][key];
      callStr = callStr
        .replace(/value\.x/g, value.x)
        .replace(/value\.y/g, value.y);
      let func = new Function(`return (${callStr});`);
      func();
      oldKeyValues[keyName] = true;
    } else if (!key.startsWith("axes[") && !inp.Get(keyName)) {
      oldKeyValues[keyName] = false;
    }
  });
}

/* ************ */
/*  UPDATEFUNC  */
/* ************ */

function updateInputs() {
  updateKeyboard();
  updateGamepad();
  updateMouse();
  requestAnimationFrame(updateInputs);
}
requestAnimationFrame(updateInputs);
