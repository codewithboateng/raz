"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TutorialCardProps {
    children: ReactNode;
    className?: string;
    onNext?: () => void;
    onBack?: () => void;
    showNext?: boolean;
    showBack?: boolean;
}

export function TutorialCard({
    children,
    className,
    onNext,
    onBack,
    showNext = true,
    showBack = false,
}: TutorialCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
            className={cn(
                "glass-card p-6 md:p-8 max-w-md w-full relative overflow-hidden backdrop-blur-xl bg-black/40 border border-white/10 shadow-2xl rounded-2xl",
                className
            )}
        >
            {/* Glow effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

            <div className="relative z-10 space-y-6">
                {children}
            </div>

            <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/5">
                <div className="flex gap-2">
                    {/* Progress dots could go here */}
                </div>
                <div className="flex gap-4">
                    {showBack && (
                        <button
                            onClick={onBack}
                            className="text-white/50 hover:text-white text-sm font-medium transition-colors"
                        >
                            Back
                        </button>
                    )}
                    {showNext && (
                        <button
                            onClick={onNext}
                            className="bg-white text-black px-6 py-2 rounded-full font-bold text-sm tracking-wide hover:bg-gray-200 transition-colors transform hover:scale-105 active:scale-95"
                        >
                            Next
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
