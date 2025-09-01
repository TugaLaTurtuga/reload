function updateOverflows() {
  const themeItems = document.querySelectorAll(".theme-item");

  themeItems.forEach((themeItem, index) => {
    const themeItemTitle = themeItem.querySelector(".theme-item-title");

    if (!themeItemTitle) return;

    // First reset
    themeItemTitle.style.animation = "none";

    // If overflowing
    if (themeItemTitle.scrollWidth > themeItem.clientWidth) {
      // Wrap once
      if (themeItemTitle.children.length === 0) {
        const text = themeItemTitle.textContent;
        themeItemTitle.textContent = "";

        const firstSpan = document.createElement("span");
        const secondSpan = document.createElement("span");

        firstSpan.textContent = text;
        secondSpan.textContent = text;

        themeItemTitle.appendChild(firstSpan);
        themeItemTitle.appendChild(secondSpan);
      }

      // After spans are added, re-measure
      const scrollWidth = themeItemTitle.scrollWidth;
      const visibleWidth = themeItem.clientWidth;

      // Duration proportional to text length
      const duration = Math.pow((scrollWidth / visibleWidth) * 0.5, 1.15) + 0.5;

      // Unique keyframe name per item
      const animationName = `scroll-title-${index}`;

      const scrollFrames = `
        @keyframes ${animationName} {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `;

      // Inject or update <style>
      let styleTag = document.getElementById(animationName);
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = animationName;
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = scrollFrames;

      // Apply animation
      themeItemTitle.style.animation = `${animationName} ${duration}s linear infinite`;
      themeItemTitle.classList.add("overflowing");
    } else {
      // Reset if no overflow
      themeItemTitle.classList.remove("overflowing");
      themeItemTitle.style.animation = "none";
    }
  });
}

window.addEventListener("resize", updateOverflows);
