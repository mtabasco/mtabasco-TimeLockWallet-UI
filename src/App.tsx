import { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { Biconomy } from '@biconomy/mexa';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import TIME_LOCK_WALLET_ABI from './contracts/TimeLockWallet.json';
import ERC20_ABI from './contracts/ERC20.json';
import './App.css';

const BICONOMY_API_KEY = 'cxQgUMKXn.8c4a87f6-3e73-4b05-aa9b-0177b49e3827';

const ContractAddress = {
  timeLockWallet: '0xE56137B505FA8A01af98DE41E81ACcfa6D2D9369',
  poly: '0xb347b9f5b56b431b2cf4e1d90a5995f7519ca792',
  dai: '0x04df6e4121c27713ed22341e7c7df330f56f289b'
}

const domainType = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
];
const metaTransactionType = [
  { name: 'nonce', type: 'uint256' },
  { name: 'from', type: 'address' },
  { name: 'functionSignature', type: 'bytes' },
];
const timeLockWalletDomainData = {
  name: 'TimeLockWallet',
  version: 'v1',
  verifyingContract: ContractAddress.timeLockWallet,
  salt: '0x' + (42).toString(16).padStart(64, '0'),
};

function App() {

  interface Contracts {
    timeLockWallet: any;
    poly: any;
    dai: any;
  }

  interface MetaTxParams {
    functionSignature: string;
    contract: any;
    contractAddress: string;
    domainData: any;
  }

  const [web3Provider, setweb3Provider] = useState<any>();
  const [account, setAccount] = useState<string>();
  const [contracts, setContracts] = useState<Contracts>();
  const [depositList, setDepositList] = useState<any>();


  useEffect((): any => {
    const { ethereum } = window as any;
    if (ethereum && ethereum.on) {

      const biconomy = new Biconomy(
        ethereum,
        {
          apiKey: BICONOMY_API_KEY,
          debug: true,
        }
      );

      biconomy
        .onEvent(biconomy.READY, async () => {
          // Initialize your dapp here like getting user accounts etc
          console.log('Mexa is Ready');
          const web3 = new Web3(biconomy);
          setweb3Provider(web3);
          setAccount(ethereum.selectedAddress);
          setContracts(
            {
              timeLockWallet: new web3.eth.Contract(
                TIME_LOCK_WALLET_ABI as AbiItem[],
                ContractAddress.timeLockWallet),
              poly: new web3.eth.Contract(
                ERC20_ABI as AbiItem[],
                ContractAddress.poly),
              dai: new web3.eth.Contract(
                ERC20_ABI as AbiItem[],
                ContractAddress.dai)
            }
          );
        })
        .onEvent(biconomy.ERROR, (error: any, message: any) => {
          // Handle error while initializing mexa
          console.error('Error initializing Mexa', error, message);
        });

      const handleChainChanged = (chainId: string | number) => {
        console.log("Handling 'chainChanged' event with payload", chainId);
      };
      const handleAccountsChanged = async (accounts: string[]) => {
        console.log("Handling 'accountsChanged' event with payload", accounts);
        setAccount(accounts[0]);
        setDepositList(await getDeposits());  // TODO
      };
      const handleNetworkChanged = (networkId: string | number) => {
        console.log("Handling 'networkChanged' event with payload", networkId);
      };

      // ethereum.on('connect', handleConnect);
      ethereum.on('chainChanged', handleChainChanged);
      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('networkChanged', handleNetworkChanged);

      return () => {
        if (ethereum.removeListener) {
          // ethereum.removeListener('connect', handleConnect);
          ethereum.removeListener('chainChanged', handleChainChanged);
          ethereum.removeListener('accountsChanged', handleAccountsChanged);
          ethereum.removeListener('networkChanged', handleNetworkChanged);
        }
      };
    }
  }, []);

  useEffect((): any => {
    async function loadDeposits() {
      if (contracts) {
        setDepositList(await getDeposits());
      }
    }
    loadDeposits();
  }, [contracts]);

  const getDeposits = () => {
    return contracts?.timeLockWallet.methods
      .getUserDeposits()
      .call({ from: account });
  }

  const {
    register: registerPoly,
    handleSubmit: handleSubmitPoly,
    formState: { isSubmitting: isSubmittingPoly }
  } = useForm();
  const {
    register: registerDai,
    handleSubmit: handleSubmitDai,
    formState: { isSubmitting: isSubmittingDai }
  } = useForm();
  const {
    register: registerEth,
    handleSubmit: handleSubmitEth,
    formState: { isSubmitting: isSubmittingEth }
  } = useForm();

  interface FormData {
    token: string;
    amount: number;
    receiver: string;
  }

  const approve = (data: FormData) => {
    console.log('approve...', data);
    const rawAmount = data.amount * 1e18;
    if (data.token === 'POLY') {
      contracts?.poly.methods.approve(ContractAddress.timeLockWallet, rawAmount.toString()).send({ from: account })
        .then((rec: any) => console.log(rec));
    } else if (data.token === 'DAI') {
      contracts?.dai.methods.approve(ContractAddress.timeLockWallet, rawAmount.toString()).send({ from: account })
        .then((rec: any) => console.log(rec));
    }
  }
  const deposit = (data: FormData) => {
    console.log('deposit...', data);
    const rawAmount = data.amount * 1e18;

    if (data.token === 'ETH') {
      contracts?.timeLockWallet.methods.deposit(
        data.receiver
      ).send({ from: account, value: rawAmount })
        .then((rec: any) => console.log(rec));
    } else {
      contracts?.timeLockWallet.methods.deposit(
        data.token === 'POLY'
          ? ContractAddress.poly
          : ContractAddress.dai,
        rawAmount.toString(),
        data.receiver
      ).send({ from: account })
        .then((rec: any) => console.log(rec));
    }
  }

  /**
     * Prepares the metatransaction method to be executed by
     * the current web3Provider
     *
     * @param {string} functionSignature Method to be called, ABI encoded.
     * @param {string} contract Contract that has the method.
     * @param {string} contractAddress Contract address.
     * @param {string} domainData Object with domain data to compose meta transaction.
     * @return {object} { method, args } Object with the method to execute metatransaction ant required arguments
     */
  async function executeMetaTransaction(metaTxParams: MetaTxParams) {
    const { functionSignature, contract, contractAddress, domainData } =
      metaTxParams;

    const nonce = await contract.methods.getNonce(account).call();

    const message = {
      nonce: web3Provider.utils.toHex(nonce),
      from: account,
      functionSignature: functionSignature,
    };

    const dataToSign = {
      types: {
        EIP712Domain: domainType,
        MetaTransaction: metaTransactionType,
      },
      domain: domainData,
      primaryType: 'MetaTransaction',
      message: message,
    };

    web3Provider.eth.currentProvider.request(
      {
        jsonrpc: "2.0",
        id: 999999999999,
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(dataToSign)],
      })
      .then((response: any) => {

        let { r, s, v } = getSignatureParameters(web3Provider, response);

        contract.methods.executeMetaTransaction(account, functionSignature, r, s, v).send({ from: account })
          .once("confirmation", async function (confirmationNumber: any, receipt: any) {
            setDepositList(await getDeposits());
          }).on("error", function (error: any) {
            console.log(error);
          });
      })
      .catch((err: any) => console.log(err));
  }

  async function claimDeposit(index: number) {
    const functionSignature = contracts?.timeLockWallet.methods.withdraw(index)
      .encodeABI();

    await executeMetaTransaction({
      functionSignature: functionSignature,
      contract: contracts?.timeLockWallet,
      contractAddress: ContractAddress.timeLockWallet,
      domainData: timeLockWalletDomainData,
    } as MetaTxParams);
  }

  return (
    <>
      {web3Provider ?
        <>
          <> init ok</><br />
          <> account: {account} </><br />
          <>
            <button
              onClick={async () => {
                await getDeposits();
              }}
            >Get deposits</button>
          </><br />
          <br />
          <form>
            <label>Deposit POLY tokens</label><br />
            <input {...registerPoly("token")} type="hidden" value="POLY" />
            <label>Amount</label><input type="number" {...registerPoly("amount", { required: true })} /><br />
            <label>Receiver</label><input type="text" {...registerPoly("receiver", { required: true })} /><br />
            <button
              disabled={isSubmittingPoly}
              onClick={handleSubmitPoly(approve)}
              name="approve"
            >
              Approve
            </button>
            <button
              disabled={isSubmittingPoly}
              onClick={handleSubmitPoly(deposit)}
              name="deposit"
            >
              Deposit
            </button>
          </form>
          <br />
          <form>
            <label>Deposit DAI tokens</label><br />
            <input {...registerDai("token")} type="hidden" value="DAI" />
            <label>Amount</label><input type="number" {...registerDai("amount", { required: true })} /><br />
            <label>Receiver</label><input type="text" {...registerDai("receiver", { required: true })} /><br />
            <button
              disabled={isSubmittingDai}
              onClick={handleSubmitDai(approve)}
              name="approve"
            >
              Approve
            </button>
            <button
              disabled={isSubmittingDai}
              onClick={handleSubmitDai(deposit)}
              name="deposit"
            >
              Deposit
            </button>
          </form>
          <form>
            <label>Deposit ETH</label><br />
            <input {...registerEth("token")} type="hidden" value="ETH" />
            <label>Amount</label><input type="number" {...registerEth("amount", { required: true })} /><br />
            <label>Receiver</label><input type="text" {...registerEth("receiver", { required: true })} /><br />
            <button
              disabled={isSubmittingEth}
              onClick={handleSubmitEth(deposit)}
              name="deposit"
            >
              Deposit
            </button>
          </form>
          <br />
          {depositList?.length > 0 && (
            <>
              <table>
                <tr><th>Token</th><th>Amount</th><th>Unlocks at</th><th></th></tr>
                {depositList.map((deposit: any) => (
                  <tr>
                    <td>{deposit.token}</td><td>{deposit.amount / 1e18}</td><td>{new Date(deposit.releaseTime * 1000).toISOString()}</td><td>
                      {deposit.releaseTime*1000 < Date.now() && (
                        <button
                          onClick={() => claimDeposit(deposit.index)}
                        >
                          Claim deposit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </table>
            </>
          )}
        </>
        :
        <>Initalizing Web3...</>
      }
    </>
  );
}

const getSignatureParameters = (web3: any, signature: string) => {
  if (!web3.utils.isHexStrict(signature)) {
    throw new Error(
      'Given value "'.concat(signature, '" is not a valid hex string.')
    );
  }
  const r = signature.slice(0, 66);
  const s = '0x'.concat(signature.slice(66, 130));
  const v = '0x'.concat(signature.slice(130, 132));
  let vNum: number = web3.utils.hexToNumber(v);
  if (![27, 28].includes(vNum)) vNum += 27;
  return {
    r: r,
    s: s,
    v: vNum,
  };
};

export default App;
