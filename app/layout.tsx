import type { Metadata } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
const sans=DM_Sans({variable:"--font-sans",subsets:["latin"]});
const mono=Space_Mono({variable:"--font-mono",subsets:["latin"],weight:["400","700"]});
export const metadata:Metadata={title:"Pulse Lens — Camera Physio Lab",description:"Private, on-device camera-based physiological signal research demo.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>}
