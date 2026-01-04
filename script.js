// Simple JavaScript for interactivity

document.addEventListener('DOMContentLoaded', function() {
    const searchButton = document.querySelector('.search-bar button');
    const searchInput = document.querySelector('.search-bar input');

    searchButton.addEventListener('click', function() {
        const searchTerm = searchInput.value;
        if (searchTerm.trim() !== '') {
            alert('Searching for: ' + searchTerm);
            // In a real app, you would fetch search results here
        }
    });

    // Add click event listeners to video cards
    const videoCards = document.querySelectorAll('.video-card');
    videoCards.forEach(card => {
        card.addEventListener('click', function() {
            const videoTitle = this.querySelector('h3').textContent;
            alert('Playing: ' + videoTitle);
            // In a real app, you would navigate to a video player page
        });
    });
});