"use client";

import { motion } from "framer-motion";
import { Shield, Link2, Ghost, Clock, Users } from "lucide-react";
import { AnimatedLockIcon } from "@/components/animated-lock-icon";
import { useEffect, useState } from "react";

// --- Step 1: Welcome ---
export function WelcomeStep() {
    return (
        <div className="text-center space-y-6">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex justify-center"
            >
                <AnimatedLockIcon isUnlocked={false} className="w-16 h-16 text-cyan-400" />
            </motion.div>

            <div className="space-y-4">
                <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"
                >
                    Welcome to Raz
                </motion.h2>
                <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-zinc-300 leading-relaxed"
                >
                    Your messages are end-to-end encrypted and self-destruct automatically. Complete privacy, zero setup.
                </motion.p>
            </div>
        </div>
    )
}

// --- Step 2: Room Creation ---
export function RoomCreationStep() {
    return (
        <div className="space-y-6 text-center">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="grid grid-cols-2 gap-4"
            >
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center gap-3">
                    <Shield className="w-8 h-8 text-emerald-400" />
                    <span className="text-sm font-bold text-white">1:1 Secure</span>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center gap-3">
                    <Users className="w-8 h-8 text-purple-400" />
                    <span className="text-sm font-bold text-white">Group Chat</span>
                </div>
            </motion.div>

            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white">Instant Rooms</h2>
                <p className="text-zinc-300">
                    Start a private room in one click. Choose 1:1 for direct chat or Group for up to 12 people.
                </p>
            </div>
        </div>
    )
}

// --- Step 3: Encryption Explained ---
export function EncryptionStep() {
    const [text, setText] = useState("Hello World");

    useEffect(() => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
        let interval: NodeJS.Timeout;

        const scramble = () => {
            let iteration = 0;
            clearInterval(interval);
            interval = setInterval(() => {
                setText(prev =>
                    prev.split("").map((letter, index) => {
                        if (index < iteration) return "Hello World"[index];
                        return chars[Math.floor(Math.random() * chars.length)]
                    }).join("")
                );

                if (iteration >= 11) clearInterval(interval);
                iteration += 1 / 3;
            }, 30);
        }

        // Loop the animation
        const loop = setInterval(() => {
            setText("Hello World".split("").map(() => chars[Math.floor(Math.random() * chars.length)]).join(""));
            setTimeout(scramble, 500);
        }, 3000);

        scramble();

        return () => {
            clearInterval(interval);
            clearInterval(loop);
        }
    }, []);

    return (
        <div className="space-y-6 text-center">
            <div className="bg-black/50 p-4 rounded-lg font-mono text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(0,255,100,0.1)]">
                {text}
            </div>

            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white">Client-Side Encryption</h2>
                <p className="text-zinc-300">
                    Every message is encrypted on YOUR device. The server only sees gibberish. Your key stays in the URL.
                </p>
            </div>
        </div>
    )
}

// --- Step 4: Self Destruct ---
export function SelfDestructStep() {
    return (
        <div className="space-y-6 text-center">
            <div className="flex justify-center">
                <div className="relative">
                    <Clock className="w-16 h-16 text-rose-500 animate-pulse" />
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 border-2 border-t-rose-500 border-transparent rounded-full w-20 h-20 -m-2"
                    />
                </div>
            </div>
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white">No Trace Left</h2>
                <p className="text-zinc-300">
                    Rooms self-destruct after expiry. All messages vanish permanently.
                </p>
            </div>
        </div>
    )
}


// --- Step 5: Share ---
export function ShareStep() {
    return (
        <div className="space-y-6 text-center">
            <div className="flex justify-center">
                <div className="bg-blue-500/10 p-6 rounded-full ring-1 ring-blue-500/50">
                    <Link2 className="w-12 h-12 text-blue-400" />
                </div>
            </div>
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white">Share Securely</h2>
                <p className="text-zinc-300">
                    Share your room link. The encryption secret is built right in. Just copy and send.
                </p>
                <div className="bg-amber-500/10 text-amber-300 text-xs py-2 px-3 rounded border border-amber-500/20">
                    Anyone with the link can join. Share carefully.
                </div>
            </div>
        </div>
    )
}

// --- Step 6: Anonymous ---
export function AnonymousStep() {
    return (
        <div className="space-y-6 text-center">
            <div className="flex justify-center gap-4">
                <Ghost className="w-12 h-12 text-white" />
            </div>
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white">Stay Anonymous</h2>
                <p className="text-zinc-300">
                    No accounts. No emails. No tracking. You&apos;re automatically assigned a random identity.
                </p>
            </div>
        </div>
    )
}
