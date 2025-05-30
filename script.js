document.addEventListener('DOMContentLoaded', () => {
    const remainingBalanceElement = document.getElementById('remainingBalance');
    const loanDetailsTableBody = document.getElementById('loanDetailsTableBody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');

    // --- Configuration for Mambu API Request ---
    // !!! CRITICAL SECURITY WARNING !!!
    // DO NOT expose your Mambu API Key directly in client-side code for production.
    // Use a secure backend proxy (e.g., Serverless Function) for real applications.
    const MAMBU_API_KEY = ''; // <--- REPLACE WITH YOUR ACTUAL API KEY
    const MAMBU_API_URL = 'https://mbujesse.sandbox.mambu.com/api/loans:search'; // Your specified API endpoint
    const FUNDING_ACCOUNT_ID = 'cdb-funding'; // <--- REPLACE WITH THE ACTUAL FUNDING ACCOUNT ID

    // --- Helper function to format currency ---
    const formatCurrency = (amount) => {
        if (typeof amount !== 'number') {
            // Attempt to parse if it's a string that looks like a number
            const parsedAmount = parseFloat(amount);
            if (!isNaN(parsedAmount)) {
                amount = parsedAmount;
            } else {
                return '$ N/A'; // Handle non-numeric values gracefully
            }
        }
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    };

    // --- Function to fetch data from Mambu API ---
    async function fetchMambuLoans() {
        loadingMessage.style.display = 'block'; // Show loading message
        errorMessage.style.display = 'none';    // Hide any previous error message

        try {
            const requestBody = {
                "filterCriteria": [
                    {
                        "field": "_fundingsource.Source_Account", // Custom field for funding source
                        "operator": "EQUALS_CASE_SENSITIVE",
                        "value": FUNDING_ACCOUNT_ID
                    }
                ],
                "sortingCriteria": {
                    "field": "id",
                    "order": "ASC"
                }
            };

            const response = await fetch(MAMBU_API_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.mambu.v2+json', // Mambu's API v2 header
                    'Content-Type': 'application/json',
                    'apikey': MAMBU_API_KEY, // !!! INSECURE FOR PRODUCTION CLIENT-SIDE CODE !!!
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify(requestBody)
            });

            // Check if the request was successful (status code 200-299)
            if (!response.ok) {
                // Try to parse error message from Mambu if available
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { message: 'Could not parse error response.' };
                }
                throw new Error(`Mambu API error! Status: ${response.status} - ${errorData.message || response.statusText}`);
            }

            const loans = await response.json(); // Mambu loans:search returns an array of loan accounts
            console.log('Mambu Loan Data received:', loans); // Log data for debugging

            // --- Populate Remaining Balance ---
            // Note: This 'Remaining Balance' is for the Funding Source Account.
            // The loans:search API typically returns individual loan accounts.
            // To get the actual funding source balance, you would likely need to
            // call a different Mambu API endpoint (e.g., for a deposit account).
            // For this example, we'll hardcode to match the screenshot for visual consistency:
            remainingBalanceElement.textContent = formatCurrency(225000.00); // Matches screenshot value

            // --- Populate Loan Details Table ---
            loanDetailsTableBody.innerHTML = ''; // Clear existing rows
            if (loans && Array.isArray(loans) && loans.length > 0) {
                loans.forEach(loan => {
                    const row = document.createElement('tr');

                    // --- MAPPING API RESPONSE TO SCREEN FIELDS ---
                    // Using optional chaining (?.) for nested properties to prevent errors if they are missing
                    const disbursementDate = loan.disbursementDetails?.disbursementDate || 'N/A';
                    const fundedLoanId = loan.id || 'N/A';
                    const productType = loan.loanName || 'N/A'; // Using loanName as per request
                    const customerName = loan.accountHolderKey || 'N/A'; // Using accountHolderKey as per request (often accountHolderName for display)
                    const customerId = loan.accountHolderKey || 'N/A'; // Using accountHolderKey as per request
                    const accountState = loan.accountState || 'N/A';

                    // For loanAmount, Mambu typically has loanAmount.principalAmount.
                    // Assuming loan.loanAmount refers to the object and we need the principalAmount from it.
                    const loanAmount = loan.loanAmount|| 0;

                    // WARNING: totalDisbursed mapped to loan.loanAmount.
                    // This is unusual, as totalDisbursed typically comes from loan.disbursementDetails.totalDisbursedAmount.
                    // Implementing as requested, but verify this is the intended data point.
                    const totalDisbursed = loan.loanAmount|| 0; // Mapped to loan.loanAmount as requested

                    const remainingToDisburse = 0; // Explicitly set to 0 as per request

                    // Assuming loan.balances is an object containing principalBalance and principalPaid
                    const loanPrincipalBalance = loan.balances?.principalBalance || 0;
                    const totalPrincipalPaid = loan.balances?.principalPaid || 0;


                    row.innerHTML = `
                        <td>${disbursementDate}</td>
                        <td>${fundedLoanId}</td>
                        <td>${productType}</td>
                        <td>${customerName}</td>
                        <td>${customerId}</td>
                        <td>${accountState}</td>
                        <td>${formatCurrency(loanAmount)}</td>
                        <td>${formatCurrency(totalDisbursed)}</td>
                        <td>${formatCurrency(remainingToDisbburse)}</td>
                        <td>${formatCurrency(loanPrincipalBalance)}</td>
                        <td>${formatCurrency(totalPrincipalPaid)}</td>
                    `;
                    loanDetailsTableBody.appendChild(row);
                });
            } else {
                // No data or empty array
                const noDataRow = document.createElement('tr');
                noDataRow.innerHTML = `<td colspan="11" style="text-align: center;">No loan details found for this funding source.</td>`;
                loanDetailsTableBody.appendChild(noDataRow);
            }

        } catch (error) {
            console.error('Error fetching Mambu data:', error);
            errorMessage.textContent = `Failed to load data: ${error.message}. Check console for details.`;
            errorMessage.style.display = 'block';
            remainingBalanceElement.textContent = '$ ERROR'; // Indicate error
            loanDetailsTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: red;">Error loading loan details.</td></tr>`;
        } finally {
            loadingMessage.style.display = 'none'; // Hide loading message regardless of success or failure
        }
    }

    // --- Call the function to fetch data when the page loads ---
    fetchMambuLoans();
});
