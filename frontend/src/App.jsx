import React, { useState } from "react";
import "../styles/globals.css";
import Home from "./components/Home.jsx";
import { Constants } from "./hooks/constants.js";
import { useAccount } from "./hooks/useAccount.js";

const DEFAULT_CONTRACT_ID =
  Constants.VOTING_CONTRACT_ID || "shade.ballotbox.testnet";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const accountId = useAccount();

  const renderActivePage = () => {
    switch (activeTab) {
      case "home":
        return <Home accountId={accountId} />;
      default:
        return <Home accountId={accountId} />;
    }
  };

  return (
    <div className="container">
      {/* Main Content */}
      <main
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "30px 40px",
        }}
      >
        {/* Render Active Page */}
        {renderActivePage()}

        {/* Footer */}
        <footer
          style={{
            textAlign: "center",
            padding: "15px",
            marginTop: "23px",
          }}
        >
          <p style={{ margin: 0 }}>
            <a
              href="https://github.com/neargovernance"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#adb5bd", textDecoration: "none" }}
            >
              Built for NEAR Governance
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
