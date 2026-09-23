import * as THREE from '../public/vendor/three/three.module.min.js';

export const oceanThemes = {
  daybreak: { deep: '#02394d', crest: '#30cbbb', sky: '#87c9d5', horizon: '#ffe4b5', sun: '#fff3ce', light: '#ffead0', exposure: .94, night: 0 },
  sunset: { deep: '#103b59', crest: '#4ac9bf', sky: '#686d9a', horizon: '#ffb36b', sun: '#ffd293', light: '#ffd6ac', exposure: .96, night: 0 },
  moonlight: { deep: '#041b3d', crest: '#259da7', sky: '#12294b', horizon: '#617f9f', sun: '#d1eaff', light: '#c9e5ff', exposure: .95, night: 1 }
};

const noise = `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + 1.0), f.x), f.y);
}
float fbm(vec2 p) { return noise2(p) * .57 + noise2(p * 2.07 + 12.8) * .28 + noise2(p * 4.13 - 7.4) * .15; }
`;

export function makeWaterMaterial(kind = 0) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uReflectionStrength: { value: 1 }, uReflection: { value: null }, uReflectionMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 }, uKind: { value: kind }, uEnergy: { value: 0 },
      uDeep: { value: new THREE.Color() }, uCrest: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
      uLight: { value: new THREE.Vector3(.42, .5, -.75).normalize() }
    },
    vertexShader: `
      uniform float uTime, uKind, uEnergy; uniform mat4 uReflectionMatrix; varying vec4 vReflection;
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.z * 1.05 + p.x * .32 + uTime * 2.4) * .055;
        wave += sin(p.z * 2.7 - p.x * 1.1 + uTime * 3.6) * .025;
        if (uKind > .5) {
          p += normal * wave * (1.0 + uEnergy * .7);
          p.y += sin(uv.y * 18.0 + uTime * .65) * .10 * smoothstep(.25, .8, uv.x);
        } else {
          p.y += wave + sin(p.x * .23 + p.z * .37 + uTime * 1.05) * .15;
        }
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vReflection = uReflectionMatrix * vec4(vWorld,1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uKind, uEnergy;
      uniform vec3 uDeep, uCrest, uSky, uSun, uLight;
      uniform sampler2D uReflection; uniform float uReflectionStrength; varying vec4 vReflection;
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
      ${noise}
      void main() {
        vec2 flow = vec2(vWorld.x * .85, vWorld.z * .62 + uTime * 1.9);
        float n = fbm(flow), fine = noise2(flow * 10.0);
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec2 ripple = vec2(noise2(flow * 2.2 + .15) - n, noise2(flow * 2.2 + 31.4) - n);
        N = normalize(N + vec3(ripple.x * .19, fine * .04, ripple.y * .22));
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);
        float roof = uKind * smoothstep(.22, .7, vUv.x);
        float scatter = pow(max(dot(V, -uLight), 0.0), 3.0) * .55;
        vec3 color = mix(uDeep, uCrest, clamp(.06 + n * .25 + roof * .25 + scatter * .4, 0.0, 1.0));
        float streak = smoothstep(.54, .73, fbm(vec2(flow.x * 2.1, flow.y * .32)));
        color += uCrest * streak * (.06 + roof * .14);
        vec3 R = reflect(-V, N);
        vec3 reflectedSky = mix(uSky * .33, uSun * .78, pow(max(R.y, 0.0), .45));
        color = mix(color, reflectedSky, fresnel * .42);
        if(uKind < .5 && uReflectionStrength > .5 && vReflection.w > 0.0) {
          vec2 reflectionUv = vReflection.xy / vReflection.w;
          reflectionUv += ripple * .007;
          vec2 ruv=clamp(reflectionUv,.003,.997);
          vec3 reflection = texture2D(uReflection,ruv).rgb*.4;
          reflection += texture2D(uReflection,ruv+vec2(.002,0)).rgb*.15;
          reflection += texture2D(uReflection,ruv-vec2(.002,0)).rgb*.15;
          reflection += texture2D(uReflection,ruv+vec2(0,.002)).rgb*.15;
          reflection += texture2D(uReflection,ruv-vec2(0,.002)).rgb*.15;
          color = mix(color,reflection,.08 + fresnel * .25);
        }
        vec3 H = normalize(uLight + V);
        float spec = pow(max(dot(N, H), 0.0), 110.0) * 1.5;
        color += uSun * spec * (.45 + fine * .55);
        // Aerated water is concentrated on the falling lip, not drawn as a grid.
        float lip = uKind * smoothstep(.955, .997, vUv.x);
        float froth = smoothstep(.35, .69, fbm(flow * 2.5 + vec2(uTime * .2, 0.0)));
        float foam = lip * (.24 + froth * .70);
        foam += uKind * smoothstep(.985, 1.0, vUv.x) * .25;
        color = mix(color, vec3(.78, .97, .93), min(.92, foam));
        float distanceFog = 1.0 - exp(-length(cameraPosition - vWorld) * .009);
        color = mix(color, uSky * .52, distanceFog);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uNight: { value: 0 }, uSunDirection: { value: new THREE.Vector3(.03, .13, -.99).normalize() } },
    vertexShader: 'varying vec3 vPosition; void main(){ vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vPosition;
      uniform vec3 uSky, uHorizon, uSun, uSunDirection; uniform float uNight;
      ${noise}
      void main() {
        vec3 ray = normalize(vPosition);
        float height = max(ray.y, 0.0);
        vec3 color = mix(uHorizon, uSky, pow(smoothstep(0.0,.72,height),.6));
        float sun = max(dot(ray, uSunDirection), 0.0);
        color += uSun * smoothstep(.99955,.9998,sun) * 3.0;
        color += uSun * pow(sun, 12.0) * .20;
        float cloud = fbm(ray.xz / max(.15, ray.y) * 1.7);
        color = mix(color, uSun * .9, smoothstep(.50,.78,cloud) * smoothstep(.015,.15,height) * .29 * (1.0-uNight));
        float star = step(.998, hash21(floor(ray.xz / max(.1,ray.y)*220.0))) * uNight * smoothstep(.12,.5,height);
        color += vec3(star*.5);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

export function applyWaterTheme(material, theme) {
  const p = oceanThemes[theme];
  material.uniforms.uDeep.value.set(p.deep); material.uniforms.uCrest.value.set(p.crest);
  material.uniforms.uSky.value.set(p.sky); material.uniforms.uSun.value.set(p.sun);
}
