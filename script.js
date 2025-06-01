document.addEventListener("DOMContentLoaded", () => {
  const remainingBalanceElement = document.getElementById("remainingBalance");
  const loanDetailsTableBody = document.getElementById("loanDetailsTableBody");
  const loadingMessage = document.getElementById("loadingMessage");
  const errorMessage = document.getElementById("errorMessage");

  // --- Configuration for Proxy API Request ---
  const PROXY_API_URL = "http://localhost:3000/api/mambu-loans-search";
  const PROXY_CHANGE_STATE_URL = "http://localhost:3000/api/mambu-loan-change-state"; // Proxy API for changing loan state
  const FUNDING_ACCOUNT_ID = "cdb-funding";

  // --- Mambu Base URL for Native Screen ---
  const MAMBU_NATIVE_BASE_URL = "https://mbujesse.sandbox.mambu.com/#"; // Base URL for Mambu UI

  // --- Helper function to format currency ---
  const formatCurrency = (amount) => {
    if (typeof amount !== "number") {
      const parsedAmount = parseFloat(amount);
      if (!isNaN(parsedAmount)) {
        amount = parsedAmount;
      } else {
        return "$ N/A";
      }
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // --- Function to handle loan approval ---
  async function handleApproveLoan(loanId, buttonElement) {
    if (!confirm(`Are you sure you want to APPROVE this loan?`)) {
      return; // User cancelled
    }

    // Disable the button and change text while processing
    buttonElement.disabled = true;
    buttonElement.textContent = "Approving...";

    try {
      const response = await fetch(PROXY_CHANGE_STATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loanAccountId: loanId, // Send the loan encoded key to the proxy
          action: "APPROVE",
          notes: "Loan approved via Mambu App",
        }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: "Could not parse error response from proxy." };
        }
        throw new Error(
          `Proxy error! Status: ${response.status} - ${errorData.error || errorData.message || response.statusText}`
        );
      }

      const result = await response.json();
      console.log("Loan approval successful;", result);
      alert(`Loan approved successfully!`);
      // Refresh the table to show updated state (e.g, APPROVED)
      fetchMambuData();
    } catch (error) {
      console.error(`Error approving loan: ${error.message}`);
      // Re-enable button on error
      buttonElement.disabled = false;
      buttonElement.textContent = "Approve";
    }
  }

  // --- Function to fetch data from API via Proxy ---
  async function fetchMambuData() {
    loadingMessage.style.display = "block";
    errorMessage.style.display = "none";
    try {
      const requestBody = {
        filterCriteria: [
          {
            field: "_fundingsource.Source_Account",
            operator: "EQUALS_CASE_SENSITIVE",
            value: FUNDING_ACCOUNT_ID,
          },
        ],
        sortingCriteria: {
          field: "id",
          order: "ASC",
        },
      };
      const response = await fetch(PROXY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: "Could not parse error response from proxy." };
        }
        throw new Error(
          `Proxy error! Status: ${response.status} - ${errorData.error || errorData.message || response.statusText}`
        );
      }

      // Expecting an object with 'loans' array and 'depositAccountBalance'
      const combinedData = await response.json();
      const loans = combinedData.loans;
      const depositAccountBalance = combinedData.depositAccountBalance;

      // <--- Get the deposit account balance
      console.log("Combined Data received from Proxy:", combinedData);

      // --- Populate Remaining Balance (top of page) ---
      if (depositAccountBalance !== undefined && depositAccountBalance !== null) {
        remainingBalanceElement.textContent = formatCurrency(depositAccountBalance);
        // <--- Use deposit account balance
      } else {
        remainingBalanceElement.textContent = "$ N/A";
      }

      // --- Populate Loan Details Table ---
      loanDetailsTableBody.innerHTML = ""; // Clear existing rows
      // Clear existing rows
      if (loans && Array.isArray(loans) && loans.length > 0) {
        const tableHead = document.querySelector(".loan-details-table thead tr");
        tableHead.innerHTML = `                     
        <th>Disbursement Date</th>                     
        <th>Funded Loan ID</th>                     
        <th>Product Type</th>                     
        <th>Customer Name</th>                     
        <th>Customer ID</th>                     
        <th>Account State</th>                     
        <th>Loan Amount</th>                     
        <th>Total Disbursed</th>                     
        <th>Remaining to Disburse</th>                     
        <th>Loan Principal Balance</th>                     
        <th>Total Principal Paid</th>                 
        `;

        loans.forEach((loan) => {
          const row = document.createElement("tr");

          // --- MAPPING API RESPONSE TO SCREEN FIELDS ---
          const disbursementDate = loan.disbursementDetails?.disbursementDate || "Not Disbursed";
          const fundedLoanId = loan.id || "N/A";
          const productType = loan.productDetails?.name || "N/A";

          // Using clientDetails from the enriched loan object
          const customerName = (loan.clientDetails?.firstName || "") + " " + (loan.clientDetails?.lastName || "");
          const customerId = loan.clientDetails?.id || "N/A";
          const accountState = loan.accountState || "N/A";
          const loanAmount = loan.loanAmount || 0;
          const totalDisbursed = loan.totalDisbursed || 0; // Use the total disbursed calculated by the server
          const remainingToDisburse = loan.loanAmount - loan.totalDisbursed || 0;
          const loanPrincipalBalance = loan.balances.principalBalance || 0;
          const totalPrincipalPaid = loan.balances.principalPaid || 0;

          // Construct the Mambu native screen URL for Loan
          // Make sure loan.encodedKey is available and trimmed in the loan object from the server
          const mambuLoanUrl = `${MAMBU_NATIVE_BASE_URL}loanaccount.id=${loan.encodedKey.trim()}`;

          // Construct the Mambut native screen URL for Client
          // Ensure loan.accountHolderKey (which is the encodedKey for the client) is available
          const mambuClientUrl = `${MAMBU_NATIVE_BASE_URL}client.id=${loan.accountHolderKey.trim()}.type=indiv`;

          // --- Conditional Approval Button ---
          let approveButtonHtml = "";
          if (loan.accountState === "PENDING_APPROVAL") {
            approveButtonHtml = `
            <br>
            <button class="approve-loan-button" data-loan-encoded-key="${loan.encodedKey.trim()}"
                    style="background-color: #339933; color: white; border: none;
                    padding: 5px 10px; cursor: pointer; border-radio: 3px;
                    margin-top: 5px; font-size: 0.9em;">
              Approve
              </button>
              `;
          }

          row.innerHTML = `                         
          <td>${disbursementDate}</td>                         
          <td><a href="${mambuLoanUrl}" target ="_blank" rel="noopener noreferrer">${fundedLoanId}</a></td>                        
          <td>${productType}</td>                         
          <td>${customerName.trim() || "N/A"}</td>                         
          <td><a href="${mambuClientUrl}" target ="_blank" rel="noopener noreferrer">${customerId}</a></td>                        
          <td>${accountState}
              ${approveButtonHtml}
          </td>                         
          <td>${formatCurrency(loanAmount)}</td>                         
          <td>${formatCurrency(totalDisbursed)}</td>                         
          <td>${formatCurrency(remainingToDisburse)}</td>                         
          <td>${formatCurrency(loanPrincipalBalance)}</td>                         
          <td>${formatCurrency(totalPrincipalPaid)}</td>                     `;
          loanDetailsTableBody.appendChild(row);
        });

        // --- Event Delegation for Approve Buttons ---
        // Attach a single event listening to the table body (more efficient for dynamic content)
        loanDetailsTableBody.querySelectorAll(".approve-loan-button").forEach((button) => {
          button.addEventListener("click", (event) => {
            const loanEncodedKey = event.target.dataset.loanEncodedKey;
            handleApproveLoan(loanEncodedKey, event.target);
          });
        });
      } else {
        // Colspan adjusted back to 11
        const noDataRow = document.createElement("tr");
        noDataRow.innerHTML = `<td colspan="11" style="text-align: center;">No loan details found for this funding source.</td>`;
        loanDetailsTableBody.appendChild(noDataRow);
      }
    } catch (error) {
      console.error("Error fetching data via proxy:", error);
      errorMessage.textContent = `Failed to load data: ${error.message}. Check console for details.`;
      errorMessage.style.display = "block";
      remainingBalanceElement.textContent = "$ ERROR";
      // Colspan adjusted back to 11
      loanDetailsTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: red;">Error loading loan details.</td></tr>`;
    } finally {
      loadingMessage.style.display = "none";
    }
  }
  fetchMambuData();
});
