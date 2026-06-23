import React, { useEffect, useRef } from 'react';

const ClusterGlobe = ({ size = 660 }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // Dynamically load Three.js from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = () => initGlobe(el);
    document.head.appendChild(script);

    let animId;

    function initGlobe(container) {
      const THREE = window.THREE;
      const W = container.offsetWidth || size;
      const H = container.offsetHeight || size;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000);
      camera.position.z = 3.2;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      // Globe wireframe — green
      const geo = new THREE.SphereGeometry(1.2, 36, 36);
      const mat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true, transparent: true, opacity: 0.12 });
      const globe = new THREE.Mesh(geo, mat);
      scene.add(globe);

      // Outer shell
      const outerGeo = new THREE.SphereGeometry(1.25, 32, 32);
      const outerMat = new THREE.MeshBasicMaterial({ color: 0x34d399, wireframe: true, transparent: true, opacity: 0.05 });
      scene.add(new THREE.Mesh(outerGeo, outerMat));

      // Equatorial ring
      const ringGeo = new THREE.TorusGeometry(1.22, 0.004, 8, 100);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      // Tilted ring
      const ring2Geo = new THREE.TorusGeometry(1.22, 0.002, 8, 100);
      const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x6ee7b7, transparent: true, opacity: 0.25 });
      const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
      ring2.rotation.x = Math.PI * 0.3;
      ring2.rotation.y = Math.PI * 0.1;
      scene.add(ring2);

      // Cluster nodes on surface
      const nodes = [
        { label: 'HOST NODE', lat: 20, lon: 80, size: 0.07 },
        { label: 'NODE A', lat: 35, lon: 130, size: 0.05 },
        { label: 'NODE B', lat: -10, lon: 60, size: 0.055 },
        { label: 'NODE C', lat: 50, lon: 200, size: 0.048 },
        { label: 'NODE D', lat: -30, lon: 290, size: 0.048 },
        { label: 'NODE E', lat: 10, lon: 340, size: 0.042 },
        { label: 'NODE F', lat: -50, lon: 150, size: 0.05 },
        { label: 'NODE G', lat: 60, lon: 240, size: 0.042 },
      ];

      const nodeGroup = new THREE.Group();
      scene.add(nodeGroup);

      nodes.forEach(n => {
        const phi = (90 - n.lat) * (Math.PI / 180);
        const theta = (n.lon + 180) * (Math.PI / 180);
        const r = 1.22;
        const x = -(r * Math.sin(phi) * Math.cos(theta));
        const z = r * Math.sin(phi) * Math.sin(theta);
        const y = r * Math.cos(phi);

        // Core dot
        const dotGeo = new THREE.SphereGeometry(n.size, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(x, y, z);
        nodeGroup.add(dot);

        // Pulse ring
        const pGeo = new THREE.TorusGeometry(n.size * 2.5, 0.003, 6, 24);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.4 });
        const pulse = new THREE.Mesh(pGeo, pMat);
        pulse.position.set(x, y, z);
        pulse.lookAt(0, 0, 0);
        pulse.userData = { phase: Math.random() * Math.PI * 2 };
        nodeGroup.add(pulse);

        // Line to center
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(x, y, z)
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.08 });
        nodeGroup.add(new THREE.Line(lineGeo, lineMat));
      });

      // Orbit particles
      const orbitCount = 180;
      const orbitGeo = new THREE.BufferGeometry();
      const orbitPos = new Float32Array(orbitCount * 3);
      for (let i = 0; i < orbitCount; i++) {
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;
        const r = 1.4 + Math.random() * 0.4;
        orbitPos[i * 3] = r * Math.sin(theta) * Math.cos(phi);
        orbitPos[i * 3 + 1] = r * Math.cos(theta);
        orbitPos[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
      }
      orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
      const orbitMat = new THREE.PointsMaterial({ size: 0.012, color: 0x10b981, transparent: true, opacity: 0.4 });
      const orbitPoints = new THREE.Points(orbitGeo, orbitMat);
      scene.add(orbitPoints);

      // Inner ambient glow
      const ambGeo = new THREE.SphereGeometry(1.18, 32, 32);
      const ambMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.04 });
      scene.add(new THREE.Mesh(ambGeo, ambMat));

      let rotY = 0, velY = 0.0003, t = 0;

      function animate() {
        animId = requestAnimationFrame(animate);
        t += 0.016;
        rotY += velY;
        velY = velY * 0.997 + 0.0003 * (1 - velY / 0.002);

        globe.rotation.y = rotY;
        nodeGroup.rotation.y = rotY;
        orbitPoints.rotation.y = -rotY * 0.3;
        orbitPoints.rotation.x = t * 0.04;
        ring.rotation.y = t * 0.2;
        ring2.rotation.y = -t * 0.15;

        nodeGroup.children.forEach(child => {
          if (child.userData?.phase !== undefined) {
            child.userData.phase += 0.04;
            child.material.opacity = (Math.sin(child.userData.phase) * 0.5 + 0.5) * 0.6;
            child.scale.setScalar(1 + Math.sin(child.userData.phase) * 0.3);
          }
        });

        renderer.render(scene, camera);
      }

      animate();
    }

    return () => {
      cancelAnimationFrame(animId);
      // Clean up renderer canvas
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [size]);

  return (
    <div ref={mountRef} style={{ width: size, height: size }} />
  );
};

export default ClusterGlobe;