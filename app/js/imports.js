const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

function easeInOut(t) {
    return t < 0.5
        ? 2 * t * t
        : -1 + (4 - 2 * t) * t;
}
  
function easeIn(t) {
    return t * t;
}
  
function easeOut(t) {
    return t * (2 - t);
}