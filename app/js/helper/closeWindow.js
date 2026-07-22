function closeWindow() {
    window.close();
}

// close window when ctrl+w is pressed or escape is pressed or cmd+w is pressed
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || (event.ctrlKey && event.key === 'w') || (event.metaKey && event.key === 'w')) {
        closeWindow();
    }
});
