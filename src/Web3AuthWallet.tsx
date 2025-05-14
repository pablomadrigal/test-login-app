import { useWeb3Auth } from "./hooks/useWeb3Auth";
import "./App.css";

function Web3AuthWallet() {
    const {
        loggedIn,
        login,
        logout,
        getUserInfo,
        getStarkAccount,
        getStarkKey,
        deployAccount,
    } = useWeb3Auth();

    const loggedInView = (
        <>
            <div className="flex-container">
                <div>
                    <button onClick={getUserInfo} className="card">
                        Get User Info
                    </button>
                </div>
                <div>
                    <button onClick={getStarkAccount} className="card">
                        Get Stark Accounts
                    </button>
                </div>
                <div>
                    <button onClick={getStarkKey} className="card">
                        Get Stark Key
                    </button>
                </div>
                <div>
                    <button onClick={deployAccount} className="card">
                        Deploy Account
                    </button>
                </div>
                <div>
                    <button onClick={logout} className="card">
                        Log Out
                    </button>
                </div>
            </div>
        </>
    );

    const unloggedInView = (
        <button onClick={login} className="card">
            Login
        </button>
    );

    return (
        <div className="container">
            <h1 className="title">
                <a target="_blank" href="https://web3auth.io/docs/sdk/pnp/web/no-modal" rel="noreferrer">
                    Web3Auth
                </a>
                & React StarkNet Example
            </h1>

            <div className="grid">{loggedIn ? loggedInView : unloggedInView}</div>
        </div>
    );
}

export default Web3AuthWallet;