async function moveCursor(x, y) {
  const cursorPos = await ipcRenderer.invoke("get-cursor-pos");

  const accel = settings.controller.cursorAceleration;
  const sens = settings.controller.cursorSensitifity;

  // Per-axis signs
  const signX = x >= 0 ? 1 : -1;
  const signY = y >= 0 ? 1 : -1;

  // Apply acceleration to absolute values, then restore sign
  const deltaX =
    ((signX * Math.pow(Math.abs(x * accel), accel)) / accel) * sens;
  const deltaY =
    ((signY * Math.pow(Math.abs(y * accel), accel)) / accel) * sens;

  let newCursorPos = {
    x: cursorPos.x + deltaX,
    y: cursorPos.y + deltaY,
  };

  // Keep within bounds if needed
  if (settings.controller.keepMouseBetweenBounds) {
    newCursorPos.x = Math.max(0, Math.min(newCursorPos.x, window.innerWidth));
    newCursorPos.y = Math.max(0, Math.min(newCursorPos.y, window.innerHeight));
  }

  ipcRenderer.invoke("set-cursor-pos", newCursorPos.x, newCursorPos.y);
}

function scroll(x, y) {
  if (settings.controller.invertScroll) {
    y = -y;
    x = -x;
  }

  ipcRenderer.invoke(
    "scroll-cursor",
    x * settings.controller.scrollSensitifity,
    y * settings.controller.scrollSensitifity,
  );
}

function getGridXSize(nodes) {
  const visible = Array.from(nodes).filter((el) => el.offsetParent !== null);
  if (visible.length === 0) return 0;
  const uniqueX = [...new Set(visible.map((el) => el.offsetLeft))];
  return uniqueX.length;
}

async function moveVirtualCursor(x, y) {
  const moveVirtualCursorElements = getCurrenrVirtualCursorElements();
  let i = -1;
  for (let index = 0; index < moveVirtualCursorElements.length; ++index) {
    if (!moveVirtualCursorElements[index][0].classList.contains("hidden")) {
      i = index;
      break;
    }
  }

  const allAlbums = moveVirtualCursorElements[i][2];
  let nodes =
    moveVirtualCursorElements[i][1][moveVirtualCursorElements[i][1].pop()];
  const allNodes = moveVirtualCursorElements[i][1][0];

  console.log(nodes);
  const gridXSize = getGridXSize(nodes);
  const gridYSize = Math.ceil(allAlbums.length / gridXSize);
  const [cursorPos, isInCard] = await getCurrentGridPosition(allNodes);

  let pos = cursorPos;
  if (isInCard) {
    pos += x - y * gridXSize;
    if (pos < 0) {
      if (x !== 0) {
        pos = gridXSize - 1;
      } else {
        let gridPosY = Math.floor(cursorPos / gridXSize);
        let gridPosX = cursorPos % gridXSize;
        pos = gridPosX + (gridPosY + gridYSize) * gridXSize;

        if (gridYSize > 2) {
          if (Math.min(Math.max(0, pos), allAlbums.length - 1) !== pos) {
            pos = gridPosX + (gridPosY + gridYSize - 1) * gridXSize;
          }
        }
      }
      if (pos >= allAlbums.length) {
        pos -= gridXSize;
      }
    } else if (pos >= allAlbums.length) {
      let gridPosY = Math.floor(cursorPos / gridXSize);
      let gridPosX = cursorPos % gridXSize;
      if (x !== 0) {
        if (gridPosX + 1 === gridXSize) {
          pos = cursorPos - gridXSize + 1;
        } else {
          pos = cursorPos - gridXSize;
        }
      } else {
        pos = gridPosX;
      }
      if (pos < 0) {
        pos += gridXSize;
      }
    }
  }

  // Ensure pos is within bounds
  const maxIndex = Math.max(0, allAlbums.length - 1);
  if (typeof pos !== "number" || Number.isNaN(pos)) pos = 0;
  pos = Math.min(Math.max(0, pos), maxIndex);
  const album = allAlbums[pos];

  const playerControlsRect = playerControls.getBoundingClientRect();
  const albumRect = album.getBoundingClientRect();
  let albumCenterX = Math.ceil(albumRect.left + albumRect.width / 2);
  let albumCenterY = Math.ceil(albumRect.top + albumRect.height / 2);

  // scroll until album is fully visible
  let safety = allAlbums.length; // prevent infinite loop
  while (
    (albumCenterY >= playerControlsRect.top - albumRect.height / 3 ||
      albumCenterY < albumRect.height / 3) &&
    safety-- > 0
  ) {
    if (albumCenterY >= playerControlsRect.top - albumRect.height / 3) {
      mainContent.scrollBy(0, albumRect.height);
      albumCenterY -= albumRect.height;
    } else if (albumCenterY < albumRect.height / 3) {
      mainContent.scrollBy(0, -albumRect.height);
      albumCenterY += albumRect.height;
    }
  }

  await ipcRenderer.invoke("set-cursor-pos", albumCenterX, albumCenterY);
}

async function getCurrentGridPosition(allAlbums) {
  let closestIndex = -1;
  let closestDistance = Infinity;
  let isInCard = false;

  const cursorPos = await ipcRenderer.invoke("get-cursor-pos");

  for (let index = 0; index < allAlbums.length; index++) {
    const rect = allAlbums[index].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = cursorPos.x - centerX;
    const dy = cursorPos.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;

      // check if cursor is inside this rect
      if (
        cursorPos.x >= rect.left &&
        cursorPos.x <= rect.right &&
        cursorPos.y >= rect.top &&
        cursorPos.y <= rect.bottom
      ) {
        isInCard = true;
        break; // stop early since cursor is inside a card
      }
    }
  }

  if (closestIndex === -1) return [null, false];
  return [closestIndex, isInCard];
}

function clickVirtualCursor(mouseButton) {
  ipcRenderer.invoke("click-cursor", mouseButton);
}

function stickyClickVirtualCursor(mouseButton, stick) {
  ipcRenderer.invoke("sticky-click-cursor", mouseButton, stick);
}
