// Create tooltip element
const tooltip = document.createElement("div");
tooltip.className = "custom-tooltip";
document.body.appendChild(tooltip);

function getTooltips() {
  // Show tooltip on hover for elements with [title]
  document.querySelectorAll("[title]").forEach((el) => {
    const titleText = el.getAttribute("title");

    el.addEventListener("mouseenter", (e) => {
      tooltip.textContent = titleText;
      el.setAttribute("data-title", titleText); // store for accessibility
      el.removeAttribute("title"); // prevent native tooltip
      tooltip.classList.add("show");
    });

    el.addEventListener("mousemove", (e) => {
      const padding = 10; // space from screen edges
      const tooltipRect = tooltip.getBoundingClientRect();

      let left = e.pageX;
      let top = e.pageY + 25;

      // Clamp X within viewport
      if (left + tooltipRect.width + padding > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - padding;
      }
      if (left < padding) {
        left = padding;
      }

      // Clamp Y within viewport
      if (
        top + tooltipRect.height + padding >
        window.scrollY + window.innerHeight
      ) {
        top = e.pageY - tooltipRect.height - 10; // place above cursor if no room below
      }
      if (top < window.scrollY + padding) {
        top = window.scrollY + padding;
      }

      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    });

    el.addEventListener("mouseleave", () => {
      tooltip.classList.remove("show");
    });
  });
}
getTooltips();
