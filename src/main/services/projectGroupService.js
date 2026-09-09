const crypto = require('crypto');
const configService = require('./configService');
const ProjectGroups = require('../../shared/projectGroups');

class ProjectGroupService {
  constructor(options = {}) {
    this.configService = options.configService || configService;
  }

  _store() {
    return ProjectGroups.normalizeStore(this.configService.get('projectGroups'));
  }

  _save(store) {
    return this.configService.setRendererPreference('projectGroups', ProjectGroups.normalizeStore(store));
  }

  list() {
    return this._store();
  }

  create(values = {}) {
    const groupId = `project_group_${crypto.randomUUID()}`;
    const result = ProjectGroups.createGroup(this._store(), values, groupId);
    if (!result.group) throw new Error('项目组信息无效');
    this._save(result.store);
    return result.group;
  }

  update(groupId, values = {}) {
    const result = ProjectGroups.updateGroup(this._store(), groupId, values);
    if (!result.group) throw new Error('项目组不存在或信息无效');
    this._save(result.store);
    return result.group;
  }

  delete(groupId) {
    const result = ProjectGroups.deleteGroup(this._store(), groupId);
    if (!result.deleted) throw new Error('项目组不存在');
    this._save(result.store);
    return { deleted: true, groupId };
  }
}

module.exports = new ProjectGroupService();
module.exports.ProjectGroupService = ProjectGroupService;
