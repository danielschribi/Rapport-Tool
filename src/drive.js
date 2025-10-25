export class DriveWritable {
  async init(){ /* TODO: echte Drive-Implementierung */ }
  async listUsers(){ return []; } async saveUsers(){}

  async getStammdaten(){ return { anlage:[], status:[], bereich:[] }; }
  async listRapporte(){ return []; } async saveRapporte(){}

  async listMeldungen(){ return []; } async saveMeldungen(){}

  async listMassnahmen(){ return []; } async saveMassnahmen(){}

  fotoPath(){ throw new Error("Not implemented in sample"); }
  meta(){ return { backend:"drive", note:"Not implemented in sample" }; }
}

export class DriveReadOnly {
  async init(){}
  async listUsers(){ return []; }
  async saveUsers(){ throw new Error("read only"); }

  async getStammdaten(){ return { anlage:[], status:[], bereich:[] }; }
  async listRapporte(){ return []; } async saveRapporte(){ throw new Error("read only"); }

  async listMeldungen(){ return []; } async saveMeldungen(){ throw new Error("read only"); }
  async listMassnahmen(){ return []; } async saveMassnahmen(){ throw new Error("read only"); }

  fotoPath(){ throw new Error("read only"); }
  meta(){ return { backend:"driveread", note:"read-only via share link" }; }
}
