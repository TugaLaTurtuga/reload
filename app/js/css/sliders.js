
class SliderController {
    constructor() {
        this.sliders = [];
        this.updateSliders();
    }

    updateSliders() {
        this.sliders = Array.from(document.querySelectorAll('.slider'));
        this.sliders.forEach((slider) => {
            // Find all <span> elements associated with this slider
            const spanElements = Array.from(
                document.querySelectorAll(`span[data-slider="${slider.id}"]`)
            );

            this.updateSlider(slider); // Update background and spans on initialization
            this._addSliderListeners(slider, spanElements); // Attach listeners
        });
    }

    updateSlider(slider) {
        const spans = Array.from(
            document.querySelectorAll(`span[data-slider="${slider.id}"]`)
        );
        this._updateSliderBackground(slider);
        this._updateSpans(slider, spans);
    }

    // updates the background exs: 
    // .50%  => (==o--)
    // .75%  => (==o-)
    // .100% => (===o)

    _updateSliderBackground(slider) {
        const percentage = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--slider-value', `${percentage}%`); // Set slider value dynamically
    }

    _updateSpans(slider, spans) {
        spans.forEach((span) => {
            // Album Rating: 
            let addedInfo = '';
            if (span.textContent.includes(':')) {
                addedInfo = `${span.textContent.split(':')[0]}:`;
            }

            const modeString = span.getAttribute('mode') || ''; // Read the mode attribute
            let [mode, fixedValue] = modeString.split(';').map((item) => item.trim()); // Split and trim
            fixedValue = !isNaN(parseFloat(fixedValue)) ? parseFloat(fixedValue) : 1;
            const value = slider.value;

            const maxValue = slider.max;
            const minValue = slider.min;

            if (mode === '%') { // Display as percentage
                span.textContent = `${addedInfo} ${(((value - minValue) / (maxValue - minValue)) * 100).toFixed(fixedValue)}%`;
            } else if (mode && !isNaN(parseFloat(mode))) { // Fixed multiplier
                const totalDigits = String(parseInt(maxValue)).length;
                const scaledValue = ((value - minValue) / (maxValue - minValue)) * parseFloat(mode);
                
                // Split integer and fractional parts
                const [intPart, fracPartRaw] = scaledValue.toFixed(fixedValue).split('.');
                const intPadded = intPart.padStart(totalDigits, '0');

                // Combine padded integer with fractional
                span.textContent = `${addedInfo} ${intPadded}.${fracPartRaw}`;
            } else if (mode === 'raw') { // Raw slider value
                span.textContent = `${addedInfo} ${value}`;
            } else {
                span.textContent = `${addedInfo} ${Math.round(value, 2)}`; // Default: Two decimal places
            }
        });
    }

    _handleSliderScroll(event, slider) {
        event.preventDefault(); // Prevent the page from scrolling
        const scrollSpeed = 0.25;
        const step = (slider.max - slider.min) / 100 * event.deltaY * scrollSpeed;

        // Update the slider's value based on scroll direction
        slider.value = Math.max(slider.min, Math.min(slider.max, parseFloat(slider.value) - step));

        // Trigger the input event programmatically
        const inputEvent = new Event('input', { bubbles: true });
        slider.dispatchEvent(inputEvent); // Dispatch input event to trigger any associated listeners
    }

    _addSliderListeners(slider, spans) {
        if (spans.length > 0) {
            slider.addEventListener('input', () => this._updateSpans(slider, spans));
            this._updateSpans(slider, spans);
        }
        
        slider.addEventListener('input', () => this._updateSliderBackground(slider));
        if (slider.id !== 'progress-bar') slider.addEventListener('wheel', (event) => this._handleSliderScroll(event, slider));
    }

    setColor(slider, color, differentThumbColor = false, thumbColor = 'white') {
        // Set the main track color
        slider.style.setProperty('--slider-color', color);

        // Set a different color for the thumb if specified
        if (differentThumbColor) {
            slider.style.setProperty('--slider-thumb-color', thumbColor);
        } else {
            // Fallback to the same color as the track
            slider.style.setProperty('--slider-thumb-color', color);
        }
    }

    setBackGroundColor(slider, color) {
        slider.style.setProperty('--slider-background-color', color);
    }
}

sController = new SliderController();
