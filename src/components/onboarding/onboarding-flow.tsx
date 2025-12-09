"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { OnboardingBackground } from "./onboarding-background";
import { TutorialCard } from "./tutorial-card";
import {
    WelcomeStep,
    RoomCreationStep,
    EncryptionStep,
    SelfDestructStep,
    ShareStep,
    AnonymousStep
} from "./step-content";

interface OnboardingFlowProps {
    onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
    const [step, setStep] = useState(0);

    const nextStep = () => {
        if (step < 5) {
            setStep((prev) => prev + 1);
        } else {
            onComplete();
        }
    };

    const prevStep = () => {
        if (step > 0) {
            setStep((prev) => prev - 1);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 0: return <WelcomeStep />;
            case 1: return <RoomCreationStep />;
            case 2: return <EncryptionStep />;
            case 3: return <SelfDestructStep />;
            case 4: return <ShareStep />;
            case 5: return <AnonymousStep />;
            default: return null;
        }
    };

    return (
        <div className="relative h-screen w-full overflow-hidden font-sans">
            {/* 3D Background */}
            <OnboardingBackground />

            <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
                {/* Main Content */}
                <AnimatePresence mode="wait">
                    <TutorialCard
                        key={step}
                        onNext={nextStep}
                        onBack={prevStep}
                        showBack={step > 0}
                        showNext={true}
                    >
                        {renderStep()}

                        {step === 5 && (
                            <div className="mt-6 flex flex-col gap-3">
                                <button
                                    onClick={onComplete}
                                    className="w-full bg-linear-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-green-900/20 transform transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Create Your First Room
                                </button>
                            </div>
                        )}
                    </TutorialCard>
                </AnimatePresence>

                {/* Progress Indicator */}
                <div className="mt-8 flex gap-2">
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <div
                            key={idx}
                            className={`h-1.5 rounded-full transition-all duration-300 ${idx === step ? "w-8 bg-white" : "w-2 bg-white/20"
                                }`}
                        />
                    ))}
                </div>

                {/* Skip Button */}
                <button
                    onClick={onComplete}
                    className="absolute top-8 right-8 text-zinc-500 hover:text-white text-sm transition-colors"
                >
                    Skip Tutorial
                </button>
            </div>
        </div>
    );
}
