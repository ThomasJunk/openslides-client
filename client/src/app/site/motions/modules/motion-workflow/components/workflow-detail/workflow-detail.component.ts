import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { MotionStateRepositoryService } from 'app/core/repositories/motions/motion-state-repository.service';
import { MotionWorkflowRepositoryService } from 'app/core/repositories/motions/motion-workflow-repository.service';
import { ComponentServiceCollector } from 'app/core/ui-services/component-service-collector';
import { PromptService } from 'app/core/ui-services/prompt.service';
import { MergeAmendment, MotionState } from 'app/shared/models/motions/motion-state';
import { infoDialogSettings } from 'app/shared/utils/dialog-settings';
import { BaseComponent } from 'app/site/base/components/base.component';
import { ViewMotionState } from 'app/site/motions/models/view-motion-state';
import { ViewMotionWorkflow } from 'app/site/motions/models/view-motion-workflow';

/**
 * Declares data for the workflow dialog
 */
interface DialogData {
    title: string;
    description: string;
    value: string;
    deletable?: boolean;
    allowEmpty?: boolean;
}

/**
 * Determine answers from the dialog
 */
interface DialogResult {
    action: 'update' | 'delete';
    value?: string;
}

/**
 * Defines state permissions
 */
interface StatePerm {
    name: string;
    selector: string;
    type: string;
    reference?: string;
}

/**
 * Defines the structure of AmendmentIntoFinal
 */
interface AmendmentIntoFinal {
    merge: MergeAmendment;
    label: string;
}

/**
 * Defines the structure of restrictions
 */
interface Restriction {
    key: string;
    label: string;
}

/**
 * Motion workflow management detail view
 */
@Component({
    selector: 'os-workflow-detail',
    templateUrl: './workflow-detail.component.html',
    styleUrls: ['./workflow-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowDetailComponent extends BaseComponent implements OnInit {
    /**
     * Reference to the workflow dialog
     */
    @ViewChild('workflowDialog', { static: true })
    private workflowDialog: TemplateRef<string>;

    /**
     * Holds the dialog data
     */
    public dialogData: DialogData;

    /**
     * Holds the current workflow
     */
    public workflow: ViewMotionWorkflow;

    /**
     * The header rows that the table should show
     * Updated through subscription
     */
    public headerRowDef: string[] = [];

    /**
     * Determine label colors. Where they should come from is currently now know
     */
    public labelColors: string[] = ['grey', 'red', 'green', 'lightblue', 'yellow'];

    /**
     * Holds state permissions
     */
    private statePermissionsList = [
        { name: 'Recommendation label', selector: 'recommendation_label', type: 'input' },
        { name: 'Allow support', selector: 'allow_support', type: 'check' },
        { name: 'Allow create poll', selector: 'allow_create_poll', type: 'check' },
        { name: 'Allow submitter edit', selector: 'allow_submitter_edit', type: 'check' },
        { name: 'Do not set number', selector: 'dont_set_number', type: 'check' },
        { name: 'Show state extension field', selector: 'show_state_extension_field', type: 'check' },
        {
            name: 'Show recommendation extension field',
            selector: 'show_recommendation_extension_field',
            type: 'check'
        },
        { name: 'Show amendment in parent motion', selector: 'merge_amendment_into_final', type: 'amendment' },
        { name: 'Restrictions', selector: 'restriction', type: 'restriction' },
        { name: 'Label color', selector: 'css_class', type: 'color' },
        { name: 'Next states', selector: 'next_states_id', type: 'state' }
    ] as StatePerm[];

    /**
     * Determines possible restrictions
     */
    public restrictions = [
        { key: 'motions.can_manage', label: 'Can manage motions' },
        { key: 'motions.can_see_internal', label: 'Can see motions in internal state' },
        { key: 'motions.can_manage_metadata', label: 'Can manage motion metadata' },
        { key: 'is_submitter', label: 'Submitters' }
    ] as Restriction[];

    /**
     * Determines possible "Merge amendments into final"
     */
    public amendmentIntoFinal = [
        { merge: MergeAmendment.NO, label: 'No' },
        { merge: MergeAmendment.UNDEFINED, label: '-' },
        { merge: MergeAmendment.YES, label: 'Yes' }
    ] as AmendmentIntoFinal[];

    /**
     * Constructor
     *
     * @param title Set the page title
     * @param translate Handle translations
     * @param matSnackBar Showing error
     * @param promptService Promts
     * @param dialog Opening dialogs
     * @param workflowRepo The repository for workflows
     * @param route Read out URL paramters
     */
    public constructor(
        componentServiceCollector: ComponentServiceCollector,
        private promptService: PromptService,
        private dialog: MatDialog,
        private workflowRepo: MotionWorkflowRepositoryService,
        private stateRepo: MotionStateRepositoryService,
        private route: ActivatedRoute,
        private cd: ChangeDetectorRef
    ) {
        super(componentServiceCollector);
    }

    /**
     * Init.
     *
     * Observe the parameters of the URL and loads the specified workflow
     */
    public ngOnInit(): void {
        const paramsId = parseInt(this.route.snapshot.paramMap.get('id'), 10);

        this.subscriptions.push(
            this.workflowRepo.getViewModelObservable(paramsId).subscribe(newWorkflow => {
                if (newWorkflow) {
                    this.workflow = newWorkflow;
                    this.updateRowDef();
                    this.cd.markForCheck();
                }
            }),

            this.stateRepo
                .getViewModelListObservable()
                .pipe(map(states => states.filter(state => this.workflow.state_ids.includes(state.id))))
                .subscribe(states => {
                    if (states) {
                        this.cd.markForCheck();
                    }
                })
        );
    }

    /**
     * Click handler for the state names.
     * Opens a dialog to rename a state.
     *
     * @param state the selected workflow state
     */
    public onClickStateName(state: ViewMotionState): void {
        this.openEditDialog(state.name, 'Rename state', '', true).subscribe(result => {
            if (result) {
                this.cd.detectChanges();
                if (result.action === 'update') {
                    this.stateRepo.update({ name: result.value }, state).then(() => {}, this.raiseError);
                } else if (result.action === 'delete') {
                    const content = this.translate.instant('Delete') + ` ${state.name}?`;

                    this.promptService.open('Are you sure', content).then(promptResult => {
                        if (promptResult) {
                            this.stateRepo.delete(state).then(() => {}, this.raiseError);
                        }
                    });
                }
            }
        });
    }

    /**
     * Click handler for the button to add new states the the current workflow
     * Opens a dialog to enter the workflow name
     */
    public onNewStateButton(): void {
        this.openEditDialog('', this.translate.instant('New state'), this.translate.instant('Name')).subscribe(
            result => {
                if (result && result.action === 'update') {
                    const state = new MotionState({
                        name: result.value,
                        workflow_id: this.workflow.id
                    });
                    this.stateRepo.create(state).then(() => {}, this.raiseError);
                }
            }
        );
    }

    /**
     * Click handler for the edit button.
     * Opens a dialog to rename the workflow
     */
    public onEditWorkflowButton(): void {
        this.openEditDialog(this.workflow.name, 'Edit name', 'Please enter a new workflow name:').subscribe(result => {
            if (result && result.action === 'update') {
                this.workflowRepo.update({ name: result.value }, this.workflow).then(() => {}, this.raiseError);
            }
        });
    }

    /**
     * Handler for the workflow state "input" fields.
     * Opens a dialog to edit a label.
     *
     * @param perm The permission
     * @param state The selected workflow state
     */
    public onClickInputPerm(perm: StatePerm, state: ViewMotionState): void {
        this.openEditDialog(state[perm.selector], 'Edit', perm.name, false, true).subscribe(result => {
            if (result.value === '') {
                result.value = null;
            }
            if (result && result.action === 'update') {
                this.stateRepo.update({ [perm.selector]: result.value }, state).then(() => {}, this.raiseError);
            }
        });
    }

    /**
     * Handler for toggling workflow states
     *
     * @param state The workflow state to edit
     * @param perm The states permission that was changed
     * @param event The change event.
     */
    public onToggleStatePerm(state: ViewMotionState, perm: string, event: MatCheckboxChange): void {
        this.stateRepo.update({ [perm]: event.checked }, state).then(() => {}, this.raiseError);
    }

    /**
     * Handler for selecting colors / css classes for workflow states.
     * Sets the css class for the specific workflow
     *
     * @param state The selected workflow state
     * @param color The selected color
     */
    public onSelectColor(state: ViewMotionState, color: string): void {
        this.stateRepo.update({ css_class: color }, state).then(() => {}, this.raiseError);
    }

    /**
     * Handler to add or remove next states to a workflow state
     *
     * @param nextState the potential next workflow state
     * @param state the state to add or remove another state to
     */
    public onSetNextState(nextState: ViewMotionState, state: ViewMotionState): void {
        const ids = state.next_state_ids.map(id => id);
        const stateIdIndex = ids.findIndex(id => id === nextState.id);

        if (stateIdIndex < 0) {
            ids.push(nextState.id);
        } else {
            ids.splice(stateIdIndex, 1);
        }
        this.stateRepo.update({ next_state_ids: ids }, state).then(() => {}, this.raiseError);
    }

    /**
     * Sets an access level to the given workflow state
     *
     * @param restrictions The new restrictions
     * @param state the state to change
     */
    public onSetRestriction(restriction: string, state: ViewMotionState): void {
        const restrictions = state.restriction.map(r => r);
        const restrictionIndex = restrictions.findIndex(r => r === restriction);

        if (restrictionIndex < 0) {
            restrictions.push(restriction);
        } else {
            restrictions.splice(restrictionIndex, 1);
        }
        this.stateRepo.update({ restriction: restrictions }, state).then(() => {}, this.raiseError);
    }

    /**
     * @returns the restriction label for the given restriction
     */
    public getRestrictionLabel(restriction: string): string {
        const entry = this.restrictions.find(r => r.key === restriction);
        return entry ? entry.label : '';
    }

    /**
     * Sets the 'merge_amendment_into_final' value
     *
     * @param amendment determines the amendment
     * @param state the state to change
     */
    public setMergeAmendment(amendment: number, state: ViewMotionState): void {
        this.stateRepo.update({ merge_amendment_into_final: amendment }, state).then(() => {}, this.raiseError);
    }

    /**
     * Function to open the edit dialog. Returns the observable to the result after the dialog
     * was closed
     *
     * @param value holds the valie
     * @param title The title of the dialog
     * @param description The description of the dialog
     * @param deletable determine if a delete button should be offered
     * @param allowEmpty to allow empty values
     */
    private openEditDialog(
        value: string,
        title?: string,
        description?: string,
        deletable?: boolean,
        allowEmpty?: boolean
    ): Observable<DialogResult> {
        this.dialogData = {
            title: title || '',
            description: description || '',
            value: value,
            deletable: deletable,
            allowEmpty: allowEmpty
        };

        const dialogRef = this.dialog.open(this.workflowDialog, infoDialogSettings);

        return dialogRef.afterClosed();
    }

    /**
     * Returns a merge amendment label from state
     */
    public getMergeAmendmentLabel(mergeAmendment: MergeAmendment): string {
        return this.amendmentIntoFinal.find(amendment => amendment.merge === mergeAmendment).label;
    }

    /**
     * Defines the data source for the workflow state table
     *
     * @returns the MatTableDateSource to iterate over a workflow states contents
     */
    public getTableDataSource(): MatTableDataSource<StatePerm> {
        const dataSource = new MatTableDataSource<StatePerm>();
        dataSource.data = this.statePermissionsList;
        return dataSource;
    }

    /**
     * Update the rowDefinition after Reloading or changes
     */
    public updateRowDef(): void {
        // reset the rowDef list first
        this.headerRowDef = ['perm'];
        if (this.workflow) {
            this.workflow.states.forEach(state => {
                this.headerRowDef.push(this.getColumnDef(state));
            });
        }
    }

    /**
     * Creates a unique column-def from the name and the id of a state
     *
     * @param state the workflow state
     * @returns a unique definition
     */
    public getColumnDef(state: ViewMotionState): string {
        return `${state.name}${state.id}`;
    }

    /**
     * Required to detect changes in *ngFor loops
     *
     * @param index Corresponding group that was changed
     * @returns the tracked workflows id
     */
    public trackElement(index: number): number {
        return index;
    }
}
