document.addEventListener('DOMContentLoaded', () => {
    const subTabsContainer = document.querySelector('.sub-tabs');
    if (subTabsContainer) {
        const subTabs = subTabsContainer.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        // Function to show a specific tab content
        const showTabContent = (targetId) => {
            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        };

        // Function to activate a specific tab button
        const activateTabButton = (clickedTab) => {
            subTabs.forEach(tab => tab.classList.remove('active'));
            clickedTab.classList.add('active');
        };

        // Event listener for tab clicks
        subTabsContainer.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.tab'); // Ensure clicking the tab, not its children
            if (clickedTab) {
                event.preventDefault(); // Prevent default link behavior
                const targetTabId = clickedTab.dataset.tabContent;
                if (targetTabId) {
                    activateTabButton(clickedTab);
                    showTabContent(targetTabId);
                }
            }
        });

        // Initialize: Show the 'funding' tab content as active on load
        // This is important because the screenshot shows 'Funding' active
        const initialActiveTab = subTabsContainer.querySelector('.tab[data-tab-content="funding"]');
        if (initialActiveTab) {
            activateTabButton(initialActiveTab);
            showTabContent('funding'); // Show the content for the 'funding' tab
        }
    }
});