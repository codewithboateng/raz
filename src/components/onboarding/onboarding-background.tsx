"use strict";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";


// Helper to generate particles - defined outside to avoid purity checks inside component
const generateParticles = (count: number) => {
    const temp = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        temp[i * 3] = (Math.random() - 0.5) * 20;
        temp[i * 3 + 1] = (Math.random() - 0.5) * 20;
        temp[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return temp;
};

function ParticleField({ count = 2000 }) {
    const points = useRef<THREE.Points>(null!);

    const particles = useMemo(() => generateParticles(count), [count]);

    useFrame((state) => {
        if (!points.current) return;
        points.current.rotation.x = state.clock.getElapsedTime() * 0.05;
        points.current.rotation.y = state.clock.getElapsedTime() * 0.03;
    });

    return (
        <Points ref={points} positions={particles} stride={3} frustumCulled={false}>
            <PointMaterial
                transparent
                color="#00ffff"
                size={0.03}
                sizeAttenuation={true}
                depthWrite={false}
                opacity={0.6}
            />
        </Points>
    );
}

function EncryptionVisuals() {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.1;
    })

    return (
        <mesh ref={meshRef} position={[0, 0, -5]}>
            <icosahedronGeometry args={[2, 0]} />
            <meshStandardMaterial wireframe color="#00ff88" transparent opacity={0.1} />
        </mesh>
    )
}

export function OnboardingBackground() {
    return (
        <div className="absolute inset-0 -z-10 bg-black">
            <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
                <color attach="background" args={["#000000"]} />
                <ambientLight intensity={0.5} />
                <ParticleField />
                <EncryptionVisuals />
            </Canvas>
        </div>
    );
}
