import { BigNumber, Contract, ethers, providers, utils } from "ethers"
import Head from "next/head"
import Web3Modal from "web3modal"
import React, { useState, useRef, useEffect } from "react"
import { abi, RANDOM_GAME_NFT_CONTRACT_ADDRESS } from "../constants"
import { FETCH_CREATED_GAME } from "../queries/index"
import { subgraphQuery } from "../utils"
import styles from "../styles/Home.module.css"

export default function Home() {
    const zero = BigNumber.from("0")
    const [walletConnected, setWalletConnected] = useState(false)
    const [loading, setLoading] = useState(false)
    const [isOwner, setIsOwner] = useState(false)
    const [entryFee, setEntryFee] = useState(zero)
    const [maxPlayers, setMaxPlayers] = useState(0)
    const [gameStarted, setGameStarted] = useState(false)
    const [players, setPlayers] = useState([])
    const [winner, setWinner] = useState()
    const [logs, setLogs] = useState([])
    const web3MdalRef = useRef()

    const forceUpdate = React.useReducer(() => ({}), {})[1]

    //connectWallet : connect the metamask wallet
    const connectWallet = async () => {
        try {
            await getProviderOrSigner()
            setWalletConnected(true)
        } catch (err) {
            console.log(err)
        }
    }

    /*A `Provider` is needed to interact with the blockchain - reading transactions, reading balances, reading state, etc.
     *
     * A `Signer` is a special type of Provider used in case a `write` transaction needs to be made to the blockchain, which involves the connected account
     * needing to make a digital signature to authorize the transaction being sent. Metamask exposes a Signer API to allow your website to
     * request signatures from the user using Signer functions.
     *
     * @param {*} needSigner - True if you need the signer, default false otherwise
     */
    const getProviderOrSigner = async (needSigner = false) => {
        //connect to metamask
        const provider = await web3MdalRef.current.connect()
        const web3Provider = new providers.Web3Provider(provider)
        // If user is not connected to the Mumbai network, let them know and throw an error
        const { chainId } = await web3Provider.getNetwork()
        if (chainId !== 80001) {
            window.alert("change the network to mumbai ")
            throw new Error("change network to mumbai")
        }
        if (needSigner) {
            const signer = web3Provider.getSigner()
            return signer
        }
        return web3Provider
    }

    /**
     * startGame:is called by the owner only to start the game
     */
    const startGame = async () => {
        try {
            const signer = await getProviderOrSigner(true)
            const randomGameNFTContract = new Contract(
                RANDOM_GAME_NFT_CONTRACT_ADDRESS,
                abi,
                signer
            )
            setLoading(true)
            // call start game function in the contract
            const tx = await randomGameNFTContract.startGame(maxPlayers, entryFee)
            await tx.wait()
            setLoading(false)
        } catch (err) {
            console.log(err)
            setLoading(false)
        }
    }

    /**
     * JoinGame: Is called by a player to join the game
     */
    const JoinGame = async () => {
        try {
            const signer = await getProviderOrSigner(true)
            const randomGameNFTContract = new Contract(
                RANDOM_GAME_NFT_CONTRACT_ADDRESS,
                abi,
                signer
            )
            setLoading(true)
            const tx = await randomGameNFTContract.JoinGame({
                value: entryFee,
            })
            await tx.wait()
            setLoading(false)
        } catch (error) {
            console.error(error)
            setLoading(false)
        }
    }

    /**
     * checkIfGameStarted checks if the game has started or not and intializes the logs
     * for the game
     */
    const checkIfGameStarted = async () => {
        try {
            // Get the provider from web3Modal, which in our case is MetaMask
            // No need for the Signer here, as we are only reading state from the blockchain
            const provider = await getProviderOrSigner()
            // We connect to the Contract using a Provider, so we will only
            // have read-only access to the Contract
            const randomGameNFTContract = new Contract(
                RANDOM_GAME_NFT_CONTRACT_ADDRESS,
                abi,
                provider
            )
            // read the gameStarted boolean from the contract
            const _gameStarted = await randomGameNFTContract.gameStarted()

            const _gameArray = await subgraphQuery(FETCH_CREATED_GAME())
            const _game = _gameArray.games[0]
            let _logs = []
            // Initialize the logs array and query the graph for current gameID
            if (_gameStarted) {
                _logs = [`Game has started with ID: ${_game.id}`]
                if (_game.players && _game.players.length > 0) {
                    _logs.push(`${_game.players.length} / ${_game.maxPlayers} already joined 👀 `)
                    _game.players.forEach((player) => {
                        _logs.push(`${player} joined 🏃‍♂️`)
                    })
                }
                setEntryFee(BigNumber.from(_game.entryFee))
                setMaxPlayers(_game.maxPlayers)
            } else if (!gameStarted && _game.winner) {
                _logs = [
                    `Last game has ended with ID: ${_game.id}`,
                    `Winner is: ${_game.winner} 🎉 `,
                    `Waiting for host to start new game....`,
                ]

                setWinner(_game.winner)
            }
            setLogs(_logs)
            setPlayers(_game.players)
            setGameStarted(_gameStarted)
            forceUpdate()
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * getOwner: calls the contract to retrieve the owner
     */
    const getOwner = async () => {
        try {
            // Get the provider from web3Modal, which in our case is MetaMask
            // No need for the Signer here, as we are only reading state from the blockchain
            const provider = await getProviderOrSigner()
            // We connect to the Contract using a Provider, so we will only
            // have read-only access to the Contract
            const randomGameNFTContract = new Contract(
                RANDOM_GAME_NFT_CONTRACT_ADDRESS,
                abi,
                provider
            )
            const _owner = await randomGameNFTContract.owner()
            const signer = await getProviderOrSigner(true)
            const address = await signer.getAddress()

            if (address.toLowerCase() === _owner.toLowerCase()) {
                setIsOwner(true)
            }
        } catch (err) {
            console.error(err.message)
        }
    }

    // useEffects are used to react to changes in state of the website
    // The array at the end of function call represents what state changes will trigger this effect
    // In this case, whenever the value of `walletConnected` changes - this effect will be called
    useEffect(() => {
        if (!walletConnected) {
            web3MdalRef.current = new Web3Modal({
                network: "mumbai",
                providerOptions: {},
                disableInjectedProvider: false,
            })
            connectWallet()
            getOwner()
            checkIfGameStarted()
            setInterval(() => {
                checkIfGameStarted
            }, 2000)
        }
    }, [walletConnected])

    /*
    renderButton: Returns a button based on the state of the dapp
  */
    const renderButton = () => {
        if (!walletConnected) {
            return (
                <button onClick={connectWallet} className={styles.button}>
                    Connect your wallet
                </button>
            )
        }
        if (loading) {
            return <button className={styles.button}>loading</button>
        }
        // Render when the game has started
        if (gameStarted) {
            if (players.length === maxPlayers) {
                return (
                    <button className={styles.button} disabled>
                        Choosing winner...
                    </button>
                )
            }
            return (
                <div>
                    <button className={styles.button} onClick={JoinGame}>
                        Join Game 🚀
                    </button>
                </div>
            )
        }
        // Start the game
        if (isOwner && !gameStarted) {
            return (
                <div>
                    <input
                        type="number"
                        className={styles.input}
                        onChange={(e) => {
                            // The user will enter the value in ether, we will need to convert
                            // it to WEI using parseEther
                            setEntryFee(
                                e.target.value >= 0
                                    ? utils.parseEther(e.target.value.toString())
                                    : zero
                            )
                        }}
                        placeholder="Entry Fee (ETH)"
                    />
                    <input
                        type="number"
                        className={styles.input}
                        onChange={(e) => {
                            setMaxPlayers(e.target.value ?? 0)
                        }}
                        placeholder="Max players"
                    />
                    <button className={styles.button} onClick={startGame}>
                        Start Game 🚀
                    </button>
                </div>
            )
        }
    }

    return (
        <div>
            <Head>
                <title>LW3Punks</title>
                <meta name="description" content="LW3Punks-Dapp" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <div className={styles.main}>
                <div>
                    <h1 className={styles.title}>Welcome to Random Winner Game!</h1>
                    <div className={styles.description}>
                        Its a lottery game where a winner is chosen at random and wins the entire
                        lottery pool
                    </div>
                    {renderButton()}
                    {logs &&
                        logs.map((log, index) => (
                            <div className={styles.log} key={index}>
                                {log}
                            </div>
                        ))}
                </div>
                <div>
                    <img className={styles.image} src="./randomWinner.png" />
                </div>
            </div>

            <footer className={styles.footer}>Made with &#10084; by 0xKazim</footer>
        </div>
    )
}
