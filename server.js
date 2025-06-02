// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
// const { response } = require("express"); this is unused and can be removed

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "https://joliveros1977.github.io",
  "https://joliveros1977.github.io/MyTestApp"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);
app.use(express.json());

// --- Mambu API Configuration (from environment variables) ---
const MAMBU_API_KEY = process.env.MAMBU_API_KEY;
const MAMBU_BASE_URL = "https://mbujesse.sandbox.mambu.com/api";
const MAMBU_DEPOSIT_ACCOUNT_ID = process.env.MAMBU_DEPOSIT_ACCOUNT_ID;

if (!MAMBU_API_KEY) {
  console.error("ERROR: MAMBU_API_KEY is not set in your .env file!");
  process.exit(1);
}
if (!MAMBU_DEPOSIT_ACCOUNT_ID) {
  console.error("ERROR: MAMBU_DEPOSIT_ACCOUNT_ID is not set in your .env file!");
  process.exit(1);
}

// --- Proxy Route for Mambu Data ---
app.post("/api/mambu-loans-search", async (req, res) => {
  const { filterCriteria, sortingCriteria } = req.body;
  if (!filterCriteria) {
    return res.status(400).json({ error: "filterCriteria is required." });
  }
  try {
    const mambuHeaders = {
      Accept: "application/vnd.mambu.v2+json", // Ensure v2 for all calls
      "Content-Type": "application/json",
      apikey: MAMBU_API_KEY,
    };

    // --- Prepare initial concurrent requests (Loans Search + Deposit Balance) ---
    const loansSearchPromise = axios.post(
      `${MAMBU_BASE_URL}/loans:search`,
      {
        filterCriteria: filterCriteria,
        sortingCriteria: sortingCriteria || { field: "id", order: "ASC" },
      },
      { headers: mambuHeaders }
    );

    const depositAccountBalancePromise = axios
      .get(`${MAMBU_BASE_URL}/deposits/${MAMBU_DEPOSIT_ACCOUNT_ID}`, {
        headers: mambuHeaders,
      })
      .then((response) => (response.data.balances ? response.data.balances.availableBalance : 0))

      // Extract availableBalance directly
      .catch((error) => {
        console.error(`Error fetching deposit account ${MAMBU_DEPOSIT_ACCOUNT_ID} balance:`, error.message);
        return 0;
        // Return 0 or null if balance fetch fails
      });

    //Execute loans search and deposit balance fetch concurrently
    const [loansResponse, depositAccountBalance] = await Promise.all([
      loansSearchPromise,
      depositAccountBalancePromise,
    ]);

    let loans = loansResponse.data; // Array of loan account

    // --- Fetch Total Disbursed from Transactions ---
    if (loans && loans.length > 0) {
      const disbursementPromises =  loans.map(async (loan) => {
        // If loan.disbursementDetails or loan.disbursementDetails.disbursementDate is not present, totalDisbursed is 0
        if (!loan.disbursementDetails || !loan.disbursementDetails.disbursementDate) {
          return { encodedKey: loan.encodedKey, totalDisbursed: 0};
        }

        // Else, fetch disbursement transactions for this loan
        const transactionSearchBody = {
          filterCriteria: [
            {
            field: "parentAccountKey",
            operator: "EQUALS_CASE_SENSITIVE",
            value: loan.encodedKey,
          },
          {
            field: "type",
            operator: "EQUALS_CASE_SENSITIVE",
            value: "DISBURSEMENT"
          },
          {
            field: "wasAdjusted",
            operator: "EQUALS_CASE_SENSITIVE",
            value: false
          },
        ],
          sortingCriteria: {
            field: "id",
            order: "ASC"
          }

        };

        try {
          const transactionsResponse = await axios.post(
            `${MAMBU_BASE_URL}/loans/transactions:search`,
            transactionSearchBody,
            { headers: mambuHeaders },
            {params: { detailsLevel: "FULL" }}
          );

          // Sum the 'amount' values from the disbursement transactions
          const totalDisbursed = transactionsResponse.data.reduce(
            (sum, transaction) => sum + (transaction.amount || 0),
            0
          );

          return { encodedKey: loan.encodedKey, totalDisbursed: totalDisbursed };
        } catch (error) {
          console.error (
          `Error fetching disbursement transactions for loan ${loan.encodedKey}:`,
          error.message
      );
      // Return 0 if transaction fetch fails for this loan
      return {encodedKey: loan.encodedKey, totalDisbursed: 0, fetchError: true, errorMessage: error.message };
        }
      });

      const disbursementDetailsArray = await Promise.all(disbursementPromises);
      const totalDisbursedMap = new Map(disbursementDetailsArray.map((item) => [item.encodedKey, item.totalDisbursed]));

    // --- Data Enrichment Promises (Clients and Products) ---
      const clientEncodedKeysToFetch = [...new Set(loans.map((loan) => loan.accountHolderKey))];

      const clientPromises = clientEncodedKeysToFetch.map((encodedKey) => {
        // Ensure the encodedKey is properly trimmed and URL-encoded for the URL path
        const safeEncodedKey = encodeURIComponent(encodedKey.trim());
        const clientApiUrl = `${MAMBU_BASE_URL}/clients/${safeEncodedKey}`;

        console.log(`Attempting to fetch client from URL: ${clientApiUrl}`); //Debugging Line

        return axios
          .get(clientApiUrl, { headers: mambuHeaders })
          .then((response) => response.data)
          .catch((error) => {
            console.error("Error fetching client ${encodedKey} from URL ${clientApiUrl};", error.message);
            // IMPORTANT: Return fallback object with 'encodedKey' for correct mapping later
            // And include the actual ID from the client response for accurate display
            return { id: "N/A", encodedKey: encodedKey, firstName: "N/A", lastName: "N/A" };
          });
      });

      const clientDetailsArray = await Promise.all(clientPromises);

      // Fetch Product Details
      const productEncodedKeysToFetch = [...new Set(loans.map((loan) => loan.productTypeKey))];

      const productPromises = productEncodedKeysToFetch.map((encodedKey) => {
        // Ensure the encodedKey is properly trimmed and URL-encoded for the URL path
        const safeProductEncodedKey = encodeURIComponent(encodedKey.trim());
        const productApiUrl = `${MAMBU_BASE_URL}/loanproducts/${safeProductEncodedKey}`;

        console.log(`Attempting to fetch product from URL: ${productApiUrl}`); //Debugging Line

        return axios
          .get(`${MAMBU_BASE_URL}/loanproducts/${encodeURIComponent(encodedKey.trim())}`, {
            headers: mambuHeaders,
            params: { detailsLevel: "FULL" },
          })
          .then((response) => response.data)
          .catch((error) => {
            console.error(`Error fetching product ${encodedKey}:`, error.message);
            return { id: "N/A", encodedKey: encodedKey, name: "N/A" }; // Fallback for product
          });
      });

      const productDetailsArray = await Promise.all(productPromises);

      // --- Create Maps for quick lookup ---
      const clientMap = new Map(clientDetailsArray.map((client) => [client.encodedKey, client])); // Based on your previous confirmation of loan.accountHolderKey being client.encodedKey
      const productMap = new Map(productDetailsArray.map((product) => [product.encodedKey, product])); // Assuming product.encodedKey is the key for lookup

      // Use client.encodedKey as the map key because loan.accountHolderKey is confirmed to be the encodedKey
      //console.log("--- Fetched Client Details ---");
      //console.log(JSON.stringify(clientDetailsArray, null, 2));
      //console.log("--------------------------");

      // Use product.encodedKey as the map key because loan.productKey is confirmed to be the encodedKey
      //console.log("--- Fetched Product Details ---");
      //console.log(JSON.stringify(productDetailsArray, null, 2));
      //console.log("--------------------------");

      // --- Enrich Loan Objects with Client and Product Details ---
      loans = loans.map((loan) => {
        const client = clientMap.get(loan.accountHolderKey); // Lookup by loan's accountHolderkey which is the encodedKey
        const product = productMap.get(loan.productTypeKey); // Lookup product by productTypeKey which is the encodedKey
        const totalDisbursed = totalDisbursedMap.get(loan.encodedKey) || 0; // Get from our newly created map

        return {
          ...loan,
          clientDetails: {
            id: client ? client.id : "N/A",
            firstName: client ? client.firstName : "N/A",
            lastName: client ? client.lastName : "N/A",
          },
          productDetails: {
            id: product ? product.id : "N/A",
            name: product ? product.name : "N/A",
          },
          totalDisbursed: totalDisbursed, // Added the calculated totalDisbursed
        };
      });
    }

    // --- Send Combined Data Back to Front-End ---
    const combinedData = {
      loans: loans,
      // Array of enriched loan accounts
      depositAccountBalance: depositAccountBalance,
      // The Available Balance from the deposit account
    };
    res.status(200).json(combinedData);
  } catch (error) {
    console.error("Error in proxy server processing:", error.message);
    if (error.response) {
      console.error("Mambu Response Status:", error.response.status);
      console.error("Mambu Response Data:", error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      console.error("No response received from Mambu:", error.request);
      res.status(503).json({ error: "No response from Mambu API." });
    } else {
      console.error("Error during request setup:", error.message);
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

// Proxy Route for Mambu Loan Change State (Approve Loan) ---
app.post("/api/mambu-loan-change-state", async (req, res) => {
  const { loanAccountId, action, notes } = req.body; // Extract data from front-end request

  if (!loanAccountId || !action) {
    return res.status(400).json({ error: "loanAccountId and action are required."});
  }

try {
  const mambuHeaders = {
    Accept: "application/vnd.mambu.v2+json",
    "Content-Type": "application/json",
    apiKey: MAMBU_API_KEY,
  };

  const changeStateBody= {
    action: action,
    notes: notes || ""// Use provided notes or empty string
  };

  const mambuApiUrl = `${MAMBU_BASE_URL}/loans/${encodeURIComponent(loanAccountId)}:changeState`;

  console.log(`Approving loan ${loanAccountId} with action: ${action}`);
  const mambuResponse = await axios.post(mambuApiUrl, changeStateBody, { headers: mambuHeaders });

  // Send Mambu's response back to the frontend
  res.status(mambuResponse.status).json(mambuResponse.data);

} catch (error) {
  console.error("Error in proxy server processing (mamb-loan-change-state):", error.message);
  if (error.response) {
    console.error("Mambu Response Status:", error.response.status);
    console.error("Mambu Response Data:", error.response.data);
    res.status(error.response.status).json(error.response.data);
  } else if (error.request) {
    console.error("No response received from Mambu:", error.request);
    res.status(503).json({error: "No response from Mambu API."});
  } else {
    console.error("Error during request setup:", error.message);
    res.status(500).json({ error: "Internal server error."});
  }
  }
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log("Ensure your front-end fetches data from this URL.");
});
