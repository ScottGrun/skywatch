declare module 'gltf-pipeline' {
  const api: { processGlb(glb: Buffer, options: object): Promise<{ glb: Buffer }> }
  export default api
}
