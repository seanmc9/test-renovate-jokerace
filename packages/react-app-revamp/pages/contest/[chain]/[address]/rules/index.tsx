import shallow from 'zustand/shallow'
import Head from 'next/head'
import { chains } from '@config/wagmi'
import { getLayout } from '@layouts/LayoutViewContest'
import type { NextPage } from 'next'
import { useStore } from '@hooks/useContest/store'
import Steps from '@layouts/LayoutViewContest/Timeline/Steps'
import { format } from 'date-fns'
import { CONTEST_STATUS } from '@helpers/contestStatus'
import { useNetwork } from 'wagmi'

interface PageProps {
  address: string,
}
//@ts-ignore
const Page: NextPage = (props: PageProps) => {
  const { address } = props
  const { activeChain } = useNetwork()
  const { contestState, checkIfUserPassedSnapshotLoading, snapshotTaken, didUserPassSnapshotAndCanVote, usersQualifyToVoteIfTheyHoldTokenAtTime, votingToken, contestMaxNumberSubmissionsPerUser,  amountOfTokensRequiredToSubmitEntry, contestMaxProposalCount, isSuccess, isLoading, contestName } = useStore(state =>  ({ 
    //@ts-ignore
    votingToken: state.votingToken,
    //@ts-ignore
    isLoading: state.isLoading,
    //@ts-ignore
    contestName: state.contestName, 
    //@ts-ignore
    isSuccess: state.isSuccess,
    //@ts-ignore
    amountOfTokensRequiredToSubmitEntry: state.amountOfTokensRequiredToSubmitEntry,
    //@ts-ignore
    contestMaxProposalCount: state.contestMaxProposalCount,
    //@ts-ignore
    contestMaxNumberSubmissionsPerUser: state.contestMaxNumberSubmissionsPerUser,
    //@ts-ignore
    usersQualifyToVoteIfTheyHoldTokenAtTime: state.usersQualifyToVoteIfTheyHoldTokenAtTime,
    //@ts-ignore
    didUserPassSnapshotAndCanVote: state.didUserPassSnapshotAndCanVote,
    //@ts-ignore
    snapshotTaken: state.snapshotTaken,
    //@ts-ignore
    checkIfUserPassedSnapshotLoading: state.checkIfUserPassedSnapshotLoading,
    //@ts-ignore
    contestState: state.contestState
   }), shallow);

  return (
    <>
      <Head>
        <title>Contest {contestName ? contestName : ""} rules - JokeDAO</title>
        <meta name="description" content="JokeDAO is an open-source, collaborative decision-making platform." />
      </Head>
    <h1 className='sr-only'>Rules of contest {contestName ? contestName : address} </h1>
    {!isLoading  && isSuccess && <div className='animate-appear space-y-8'>
     {contestState !== CONTEST_STATUS.SNAPSHOT_ONGOING && <section className='animate-appear'>
       <p className={`p-3 rounded-md border-solid border mb-5 text-sm font-bold
       ${(!snapshotTaken || checkIfUserPassedSnapshotLoading ) ? ' border-neutral-4' : didUserPassSnapshotAndCanVote ? 'bg-positive-1 text-positive-10 border-positive-4' : ' bg-primary-1 text-primary-10 border-primary-4'}`
       }>
         {checkIfUserPassedSnapshotLoading ? 'Checking snapshot...' : !snapshotTaken ? 'Snapshot wasn\'t taken yet.': didUserPassSnapshotAndCanVote ? 'Congrats ! Your wallet qualified to vote.' : 'Too bad, your wallet didn\'t qualify to vote.'}
       </p>
     </section>}
     <section>
       <h2 className='uppercase font-bold mb-2'>Rules</h2>
       <ul className='list-disc pis-4 leading-loose'>
         <li>
           <span className='font-bold'>{new Intl.NumberFormat().format(contestMaxProposalCount)} proposals</span>{" "}max</li>
         <li>
          
           {amountOfTokensRequiredToSubmitEntry === 0 ?  <span className='font-bold'>Anyone can submit</span> : <>
           <span className='font-bold'>{new Intl.NumberFormat().format(amountOfTokensRequiredToSubmitEntry)}{" "}<span className='normal-case'>${votingToken.symbol}</span>{" "}required</span>{' '}to submit a proposal</>}</li>
         <li>Qualified wallets can submit up to <span className='font-bold'>
          {new Intl.NumberFormat().format(contestMaxNumberSubmissionsPerUser)} proposal{contestMaxNumberSubmissionsPerUser > 1 && "s"}
         </span>
           
           </li>
         <li>Submitters qualify to vote if they have token by <span className="font-bold">{format(usersQualifyToVoteIfTheyHoldTokenAtTime, "PPP p")}</span></li>
       </ul>
     </section>
     <section>
      <h2 className='uppercase font-bold mb-2'>Token</h2>
      <ul className='list-disc pis-4 leading-loose'>
        <li title={`$${votingToken.symbol}`} className='list-item'><span className='block whitespace-nowrap overflow-hidden text-ellipsis'>Symbol: <span className='font-bold normal-case'>${votingToken.symbol}</span></span></li>
        <li title={`${new Intl.NumberFormat().format(votingToken.totalSupply.formatted)}`} className='list-item'><span className='block whitespace-nowrap overflow-hidden text-ellipsis'>Total supply: <span className='font-bold'>{new Intl.NumberFormat().format(votingToken.totalSupply.formatted)}</span></span></li>
        <li title={votingToken.address} className='list-item'><span className='block whitespace-nowrap overflow-hidden text-ellipsis'>Contract: <a className='link' target="_blank" rel="noreferrer nofollow" href={`${activeChain?.blockExplorers?.default?.url}/address/${votingToken.address}`.replace('//address', '/address')}>{votingToken.address}</a></span></li>
      </ul>
      
     </section>
     <section>
       <h2 className='uppercase leading-relaxed font-bold mb-2'>Timeline</h2>
       <Steps />
     </section>
    </div>}
  </>
)}

const REGEX_ETHEREUM_ADDRESS = /^0x[a-fA-F0-9]{40}$/

export async function getStaticPaths() {
  return { paths: [], fallback: true }
}

export async function getStaticProps({ params }: any) {
  const { chain, address } = params
  if (!REGEX_ETHEREUM_ADDRESS.test(address) || chains.filter(c => c.name.toLowerCase() === chain).length === 0 ) {
    return { notFound: true }
  }

  try {
    return {
      props: {
        address,
      }
    }
  } catch (error) {
    console.error(error)
    return { notFound: true }
  }
}
//@ts-ignore
Page.getLayout = getLayout

export default Page
