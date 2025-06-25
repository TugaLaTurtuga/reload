
// Function to show notification
function showNotification(message, color) {
    notification.textContent = message;
    notification.className = `notification fade-in`;
    notification.style.display = 'block';

    // Remove any previous fade-out
    notification.classList.remove('fade-out');

    setTimeout(() => {
        notification.classList.remove('fade-in');
        notification.classList.add('fade-out');

        // Wait for fade-out animation to complete before hiding
        notification.addEventListener('animationend', () => {
            if (notification.classList.contains('fade-out')) {
                notification.style.display = 'none';
            }
        }, { once: true });
    }, 3000);
}

