import { redirect } from 'next/navigation'

// The only page on this branch is the prototype route.
export default function Home() {
  redirect('/prototype/map')
}
