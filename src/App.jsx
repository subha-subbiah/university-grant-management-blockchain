import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import "./App.css";

const CONTRACT_ADDRESS = "0x81667B69e907AC9677388cCF54AE4Cd50772fCe0";
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

const ABI = [
  "function university() view returns (address)",
  "function grantCount() view returns (uint256)",
  "function getGrant(uint256) view returns (string title, uint256 totalFunds, uint256 remainingFunds, uint8 status, address researcher)",
  "function getApplicationCount(uint256) view returns (uint256)",
  "function getMilestoneCount(uint256) view returns (uint256)",
  "function getMilestone(uint256,uint256) view returns (string description, uint256 amount, bool submitted, bool approved)",
  "function createGrant(string) payable",
  "function applyForGrant(uint256,string)",
  "function approveApplication(uint256,uint256)",
  "function addMilestone(uint256,string,uint256)",
  "function submitMilestone(uint256,uint256)",
  "function approveMilestone(uint256,uint256)"
];

const STATUS_NAMES = ["OPEN", "ACTIVE", "COMPLETED"];

function App() {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [networkName, setNetworkName] = useState("Not Connected");
  const [role, setRole] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  
  const [grants, setGrants] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Form Inputs
  const [title, setTitle] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [proposals, setProposals] = useState({});
  const [milestoneDescs, setMilestoneDescs] = useState({});
  const [milestoneAmts, setMilestoneAmts] = useState({});

  // Toast Notifications
  const [toast, setToast] = useState(null);

  const showToast = (text, type = "info") => {
    setToast({ text, type, id: Date.now() });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Switch network helper to Sepolia
  async function switchToSepoliaNetwork() {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
      });
      return true;
    } catch (error) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID_HEX,
                chainName: "Sepolia Test Network",
                rpcUrls: ["https://rpc.sepolia.org"],
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://sepolia.etherscan.io"]
              }
            ]
          });
          return true;
        } catch (addError) {
          console.error("Failed to add Sepolia network:", addError);
        }
      }
      console.error("Failed to switch network:", error);
      return false;
    }
  }

  // Safe Grant Loader from Smart Contract (with milestone details)
  const loadGrants = useCallback(async (contractInstance) => {
    if (!contractInstance) return;
    try {
      const countBigInt = await contractInstance.grantCount();
      const count = Number(countBigInt);
      
      if (count === 0) {
        setGrants([]);
        return;
      }

      const loaded = [];
      for (let i = 1; i <= count; i++) {
        const data = await contractInstance.getGrant(i);
        const appCount = Number(await contractInstance.getApplicationCount(i));
        const msCount = Number(await contractInstance.getMilestoneCount(i));

        const milestonesList = [];
        for (let m = 0; m < msCount; m++) {
          try {
            const ms = await contractInstance.getMilestone(i, m);
            milestonesList.push({
              index: m,
              description: ms.description || ms[0],
              amount: ethers.formatEther(ms.amount || ms[1]),
              submitted: Boolean(ms.submitted !== undefined ? ms.submitted : ms[2]),
              approved: Boolean(ms.approved !== undefined ? ms.approved : ms[3])
            });
          } catch (msErr) {
            console.error(`Error loading milestone ${m} for grant ${i}:`, msErr);
          }
        }

        loaded.push({
          id: i,
          title: data[0],
          total: ethers.formatEther(data[1]),
          remaining: ethers.formatEther(data[2]),
          status: Number(data[3]),
          researcher: data[4],
          applications: appCount,
          milestones: msCount,
          milestonesList,
          category: "Research Grant"
        });
      }
      setGrants(loaded);
    } catch (err) {
      console.error("Error loading grants from contract:", err);
      showToast("Failed to fetch grants from Sepolia network", "error");
    }
  }, []);

  // Sync wallet & role dynamically when connected or on account change
  const syncWalletAndRole = useCallback(async (browserProvider, selectedAccount) => {
    if (!selectedAccount) {
      setAccount("");
      setContract(null);
      setRole("");
      setNetworkName("Not Connected");
      setGrants([]);
      return;
    }

    setAccount(selectedAccount);

    try {
      const network = await browserProvider.getNetwork();

      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        setRole("Wrong Network");
        setNetworkName("Wrong Network (Click to Switch)");
        setContract(null);
        setGrants([]);
        showToast("Connected to wrong network. Click network badge to switch to Sepolia.", "warning");
        return;
      }

      setNetworkName("Sepolia");

      const signer = await browserProvider.getSigner(selectedAccount);
      const signerAddress = await signer.getAddress();

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      setContract(c);

      const universityAddress = await c.university();

      if (signerAddress.toLowerCase() === universityAddress.toLowerCase()) {
        setRole("University");
      } else {
        setRole("Researcher");
      }

      await loadGrants(c);

    } catch (err) {
      console.error("Wallet synchronization error:", err);
      setRole("Error Syncing");
      setContract(null);
      showToast(err.shortMessage || err.message || "Failed to synchronize wallet.", "error");
    }
  }, [loadGrants]);

  // Main Connect Wallet Function
  async function connectWallet() {
    setIsConnecting(true);

    if (!window.ethereum) {
      showToast("Please install MetaMask to interact with the Sepolia smart contract.", "warning");
      setIsConnecting(false);
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();

      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        showToast("Switching to Sepolia Network...", "info");
        const switched = await switchToSepoliaNetwork();
        if (!switched) {
          showToast("Please switch MetaMask network to Sepolia.", "warning");
        }
      }

      const updatedProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await updatedProvider.send("eth_requestAccounts", []);

      if (!accounts || accounts.length === 0) {
        throw new Error("No MetaMask account connected.");
      }

      const selectedAccount = accounts[0];
      await syncWalletAndRole(updatedProvider, selectedAccount);
      showToast(`Connected: ${selectedAccount.slice(0, 6)}...${selectedAccount.slice(-4)}`, "success");

    } catch (error) {
      console.error("Wallet connection error:", error);
      if (error.code === 4001) {
        showToast("Connection request canceled in MetaMask.", "warning");
      } else {
        showToast(error.shortMessage || error.message || "Failed to connect wallet.", "error");
      }
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnectWallet() {
    setAccount("");
    setContract(null);
    setRole("");
    setNetworkName("Not Connected");
    setGrants([]);
    showToast("Wallet disconnected.", "info");
  }

  // Handle account & network change events + Auto-check on mount
  useEffect(() => {
    if (!window.ethereum) return;

    const browserProvider = new ethers.BrowserProvider(window.ethereum);

    browserProvider.send("eth_accounts", []).then(async (accounts) => {
      if (accounts && accounts.length > 0) {
        await syncWalletAndRole(browserProvider, accounts[0]);
      }
    }).catch(console.error);

    const handleAccountsChanged = async (accounts) => {
      console.log("MetaMask accountsChanged event fired:", accounts);
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
        return;
      }

      const newAccount = accounts[0];
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      await syncWalletAndRole(newProvider, newAccount);
      showToast(`Switched account to ${newAccount.slice(0, 6)}...${newAccount.slice(-4)}`, "info");
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [syncWalletAndRole]);

  // Generic Transaction Executor
  async function executeTransaction(txFn, successMessage) {
    if (!contract || !account) {
      showToast("Please connect your MetaMask wallet first.", "warning");
      return false;
    }

    try {
      showToast("Waiting for MetaMask confirmation...", "info");
      const tx = await txFn();
      showToast("Transaction submitted. Waiting for block confirmation...", "info");
      await tx.wait();
      showToast(successMessage, "success");
      await loadGrants(contract);
      return true;
    } catch (error) {
      console.error(error);
      showToast(error.reason || error.shortMessage || "Transaction failed", "error");
      return false;
    }
  }

  // Contract Action Methods
  async function createGrant() {
    if (!title || !grantAmount || isNaN(grantAmount) || Number(grantAmount) <= 0) {
      showToast("Please provide a valid grant title and funding amount in ETH.", "warning");
      return;
    }

    const success = await executeTransaction(
      () => contract.createGrant(title, { value: ethers.parseEther(grantAmount) }),
      "Grant created successfully!"
    );

    if (success) {
      setTitle("");
      setGrantAmount("");
    }
  }

  async function applyForGrant(grantId) {
    const proposalText = proposals[grantId] || "Research Grant Proposal";

    const success = await executeTransaction(
      () => contract.applyForGrant(grantId, proposalText),
      "Application submitted successfully!"
    );

    if (success) {
      setProposals({ ...proposals, [grantId]: "" });
    }
  }

  async function approveApplication(grantId) {
    await executeTransaction(
      () => contract.approveApplication(grantId, 0),
      "Application approved!"
    );
  }

  async function addMilestone(grantId) {
    const desc = milestoneDescs[grantId];
    const amt = milestoneAmts[grantId];

    if (!desc || !amt || isNaN(amt) || Number(amt) <= 0) {
      showToast("Please enter a valid milestone description and ETH amount.", "warning");
      return;
    }

    const success = await executeTransaction(
      () => contract.addMilestone(grantId, desc, ethers.parseEther(amt)),
      "Milestone added successfully."
    );

    if (success) {
      setMilestoneDescs({ ...milestoneDescs, [grantId]: "" });
      setMilestoneAmts({ ...milestoneAmts, [grantId]: "" });
    }
  }

  async function submitMilestone(grantId, milestoneIndex = 0) {
    await executeTransaction(
      () => contract.submitMilestone(grantId, milestoneIndex),
      `Milestone #${milestoneIndex + 1} submitted for university review!`
    );
  }

  async function approveMilestone(grantId, milestoneIndex = 0) {
    await executeTransaction(
      () => contract.approveMilestone(grantId, milestoneIndex),
      `Milestone #${milestoneIndex + 1} approved and ETH released!`
    );
  }

  function copyAddress(addr) {
    navigator.clipboard.writeText(addr);
    showToast("Address copied to clipboard!", "info");
  }

  // Calculated Stats from Real Blockchain Grants
  const totalReleasedSum = grants.reduce((sum, g) => {
    const total = Number(g.total) || 0;
    const remaining = Number(g.remaining) || 0;
    return sum + Math.max(0, total - remaining);
  }, 0);
  const totalFunding = totalReleasedSum > 0 ? parseFloat(totalReleasedSum.toFixed(6)).toString() : "0.0";

  const totalApplications = grants.reduce((sum, g) => sum + Number(g.applications || 0), 0);
  const activeGrantsCount = grants.filter(g => g.status === 1).length;

  // Filtered Grants
  const filteredGrants = grants.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          g.category?.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === "ALL") return matchesSearch;
    if (statusFilter === "OPEN") return matchesSearch && g.status === 0;
    if (statusFilter === "ACTIVE") return matchesSearch && g.status === 1;
    if (statusFilter === "COMPLETED") return matchesSearch && g.status === 2;
    return matchesSearch;
  });

  return (
    <div className="app-container">

      {/* Navbar / Header */}
      <header className="navbar">
        <div className="brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <div className="brand-text">
            <h1>UniGrant</h1>
            <p>Decentralized Research Funding Platform</p>
          </div>
        </div>

        <div className="header-actions">
          {account && (
            <>
              <div
                className="network-badge"
                onClick={networkName.includes("Wrong") ? switchToSepoliaNetwork : undefined}
                style={{ cursor: networkName.includes("Wrong") ? "pointer" : "default" }}
                title={networkName.includes("Wrong") ? "Click to switch to Sepolia network" : "Connected to Sepolia"}
              >
                <span className={`network-dot ${networkName.includes("Wrong") ? "demo" : ""}`}></span>
                {networkName}
              </div>

              <div className="role-badge">
                Role: {role || "Connecting..."}
              </div>
            </>
          )}

          {!account ? (
            <button className="connect-btn" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <div className="spinner"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M12 12h.01" />
                    <path d="M17 12h.01" />
                  </svg>
                  Connect MetaMask
                </>
              )}
            </button>
          ) : (
            <button className="connect-btn connected" onClick={disconnectWallet} title="Click to Disconnect">
              {`${account.slice(0, 6)}...${account.slice(-4)}`}
            </button>
          )}
        </div>
      </header>

      {/* Wallet Connection / Wrong Network Prompt */}
      {!account ? (
        <div className="notice-banner" style={{ justifyContent: "center", textAlign: "center", padding: "36px 24px" }}>
          <div className="notice-content" style={{ flexDirection: "column", gap: "14px" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M12 12h.01" />
              <path d="M17 12h.01" />
            </svg>
            <span style={{ fontSize: "16px", fontWeight: "600" }}>
              Please connect your MetaMask wallet to view and interact with live Sepolia grants.
            </span>
            <button className="connect-btn" onClick={connectWallet} disabled={isConnecting} style={{ marginTop: "4px" }}>
              Connect MetaMask Wallet
            </button>
          </div>
        </div>
      ) : networkName.includes("Wrong") && (
        <div className="notice-banner" style={{ justifyContent: "space-between", padding: "16px 24px" }}>
          <div className="notice-content">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>You are connected to the wrong network. The UniGrant smart contract is deployed on Sepolia (Chain ID 11155111).</span>
          </div>
          <button className="demo-toggle-btn" onClick={switchToSepoliaNetwork}>
            Switch to Sepolia Network
          </button>
        </div>
      )}

      {/* Main App Content when connected on Sepolia */}
      {account && !networkName.includes("Wrong") && (
        <>
          {/* Stat Overview Cards */}
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div className="stat-info">
                <span>Total Grants</span>
                <strong>{grants.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon emerald">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div className="stat-info">
                <span>Total Funding</span>
                <strong>{totalFunding} ETH</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <div className="stat-info">
                <span>Active Grants</span>
                <strong>{activeGrantsCount}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div className="stat-info">
                <span>Applications</span>
                <strong>{totalApplications}</strong>
              </div>
            </div>
          </section>

          {/* University Role: Create Grant Panel */}
          {role === "University" && (
            <section className="panel-section">
              <div className="panel-header">
                <h2>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Create New Research Grant
                </h2>
              </div>

              <div className="form-grid">
                <div className="input-wrapper">
                  <input
                    type="text"
                    placeholder="Enter grant title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>

                <div className="input-wrapper">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Funding in ETH"
                    value={grantAmount}
                    onChange={e => setGrantAmount(e.target.value)}
                  />
                  <span className="input-suffix">ETH</span>
                </div>

                <button className="btn-primary" onClick={createGrant}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Create Grant
                </button>
              </div>
            </section>
          )}

          {/* Controls Bar: Search & Filters */}
          <div className="controls-bar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search grants by title or topic..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-tabs">
              {["ALL", "OPEN", "ACTIVE", "COMPLETED"].map(tab => (
                <button
                  key={tab}
                  className={`tab-btn ${statusFilter === tab ? "active" : ""}`}
                  onClick={() => setStatusFilter(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Grants List */}
          <section className="grants-list">
            {filteredGrants.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <h3>No Grants Found</h3>
                <p>There are currently no smart contract grants matching your selection.</p>
              </div>
            ) : (
              filteredGrants.map(grant => {
                const totalETH = Number(grant.total) || 0;
                const remainingETH = Number(grant.remaining) || 0;
                const disbursedETH = Math.max(0, totalETH - remainingETH);
                const progressPct = totalETH === 0 ? 0 : Math.min(100, Math.round((disbursedETH / totalETH) * 100));

                // Process milestones with cumulative payout verification
                let runningSum = 0;
                const processedMilestones = (grant.milestonesList || []).map((ms) => {
                  const amt = Number(ms.amount) || 0;
                  runningSum += amt;

                  // Milestone is Approved & Paid ONLY if it was submitted AND cumulative amount <= disbursedETH
                  const isPaid = ms.submitted && (runningSum <= disbursedETH + 0.0000001);
                  const isSubmittedWaiting = ms.submitted && !isPaid;
                  const isOpen = !ms.submitted;

                  let statusLabel = "Milestone Open";
                  let statusClass = "open";

                  if (isPaid) {
                    statusLabel = "✓ Approved & Paid";
                    statusClass = "approved";
                  } else if (isSubmittedWaiting) {
                    statusLabel = "⏳ Submitted, Waiting for Approval";
                    statusClass = "submitted";
                  }

                  return {
                    ...ms,
                    cumulativeAmount: runningSum,
                    isPaid,
                    isSubmittedWaiting,
                    isOpen,
                    statusLabel,
                    statusClass
                  };
                });

                // Find index of next milestone eligible for submission by researcher:
                // Researcher can submit the FIRST milestone that is isOpen, PROVIDED all previous milestones are isPaid!
                const firstUnpaidMs = processedMilestones.find(ms => !ms.isPaid);
                const eligibleSubmitIndex = (firstUnpaidMs && firstUnpaidMs.isOpen) ? firstUnpaidMs.index : -1;

                return (
                  <div key={grant.id} className={`grant-card status-${grant.status}`}>
                    {/* Header */}
                    <div className="grant-card-top">
                      <div className="grant-title-area">
                        <span className="grant-id-badge">
                          GRANT #{grant.id} • {grant.category || "Research"}
                        </span>
                        <h3>{grant.title}</h3>
                      </div>

                      <span className={`badge-status status-${grant.status}`}>
                        <span className="badge-pulse"></span>
                        {STATUS_NAMES[grant.status] || "OPEN"}
                      </span>
                    </div>

                    {/* Financial Progress */}
                    <div className="financials-block">
                      <div className="financials-row">
                        <div className="fin-item">
                          <span className="fin-label">Total Funding</span>
                          <span className="fin-value">{grant.total} ETH</span>
                        </div>
                        <div className="fin-item" style={{ textAlign: "right" }}>
                          <span className="fin-label">Remaining</span>
                          <span className="fin-value">{grant.remaining} ETH</span>
                        </div>
                      </div>

                      <div className="progress-header">
                        <span>Funds Released ({disbursedETH.toFixed(4)} ETH)</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progressPct}%` }}></div>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="metrics-row">
                      <div className="metric-box">
                        <label>Applications</label>
                        <span>{grant.applications}</span>
                      </div>

                      <div className="metric-box">
                        <label>Milestones</label>
                        <span>{grant.milestones}</span>
                      </div>

                      <div className="metric-box">
                        <label>Researcher</label>
                        {grant.researcher && grant.researcher !== ethers.ZeroAddress ? (
                          <span
                            className="address-tag"
                            onClick={() => copyAddress(grant.researcher)}
                            style={{ cursor: "pointer" }}
                            title="Click to copy address"
                          >
                            {`${grant.researcher.slice(0, 6)}...${grant.researcher.slice(-4)}`}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </div>
                    </div>

                    {/* Milestone Breakdown List */}
                    <div className="milestones-container">
                      <div className="milestones-header">
                        <h4>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 11 12 14 22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                          </svg>
                          Project Milestones ({processedMilestones.length})
                        </h4>
                      </div>

                      {processedMilestones.length === 0 ? (
                        <p className="no-milestones">No milestones defined for this grant yet.</p>
                      ) : (
                        <div className="milestones-list">
                          {processedMilestones.map((ms) => {
                            const isNextToSubmit = role === "Researcher" && grant.status === 1 && eligibleSubmitIndex === ms.index;
                            const isPendingApproval = role === "University" && grant.status === 1 && ms.isSubmittedWaiting;

                            return (
                              <div
                                key={ms.index}
                                className={`milestone-item ${ms.statusClass}`}
                              >
                                <div className="milestone-left">
                                  <span className="milestone-number">#{ms.index + 1}</span>
                                  <div className="milestone-details">
                                    <strong className="milestone-title">{ms.description}</strong>
                                    <span className="milestone-amount">{ms.amount} ETH</span>
                                  </div>
                                </div>

                                <div className="milestone-right">
                                  <span className={`badge-ms ${ms.statusClass}`}>{ms.statusLabel}</span>

                                  {/* Researcher Action: Submit Next Open Milestone */}
                                  {isNextToSubmit && (
                                    <button
                                      className="btn-primary"
                                      style={{ padding: "6px 14px", fontSize: "12px" }}
                                      onClick={() => submitMilestone(grant.id, ms.index)}
                                    >
                                      Submit Milestone
                                    </button>
                                  )}

                                  {/* University Action: Approve & Release Payment */}
                                  {isPendingApproval && (
                                    <button
                                      className="btn-success"
                                      style={{ padding: "6px 14px", fontSize: "12px" }}
                                      onClick={() => approveMilestone(grant.id, ms.index)}
                                    >
                                      Approve & Release Payment ({ms.amount} ETH)
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Role-Based Form & Action Area */}
                    <div className="card-actions">
                      {/* Researcher: Apply for Open Grant */}
                      {role === "Researcher" && grant.status === 0 && (
                        <div className="action-form-row">
                          <input
                            type="text"
                            placeholder="Your proposal"
                            value={proposals[grant.id] || ""}
                            onChange={e => setProposals({ ...proposals, [grant.id]: e.target.value })}
                          />
                          <button className="btn-primary" onClick={() => applyForGrant(grant.id)}>
                            Apply for Grant
                          </button>
                        </div>
                      )}

                      {/* University: Approve Application for Open Grant */}
                      {role === "University" && grant.status === 0 && (
                        <div className="action-form-row">
                          <button className="btn-success" onClick={() => approveApplication(grant.id)}>
                            Approve Application
                          </button>
                        </div>
                      )}

                      {/* University: Form to Add New Milestone for Active Grant */}
                      {role === "University" && grant.status === 1 && (
                        <div className="action-form-row">
                          <input
                            type="text"
                            placeholder="New milestone description"
                            value={milestoneDescs[grant.id] || ""}
                            onChange={e => setMilestoneDescs({ ...milestoneDescs, [grant.id]: e.target.value })}
                          />
                          <input
                            type="number"
                            step="0.0001"
                            style={{ maxWidth: "160px" }}
                            placeholder="Amount in ETH"
                            value={milestoneAmts[grant.id] || ""}
                            onChange={e => setMilestoneAmts({ ...milestoneAmts, [grant.id]: e.target.value })}
                          />
                          <button className="btn-secondary" onClick={() => addMilestone(grant.id)}>
                            + Add Milestone
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast-item ${toast.type}`}>
            <span>{toast.text}</span>
            <button className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;