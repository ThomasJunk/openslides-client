import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ChangeRecommendationRepositoryService } from 'app/core/repositories/motions/change-recommendation-repository.service';
import { ComponentServiceCollector } from 'app/core/ui-services/component-service-collector';
import { DiffService, LineRange } from 'app/core/ui-services/diff.service';
import { OrganisationSettingsService } from 'app/core/ui-services/organisation-settings.service';
import { PromptService } from 'app/core/ui-services/prompt.service';
import { ViewUnifiedChange, ViewUnifiedChangeType } from 'app/shared/models/motions/view-unified-change';
import { mediumDialogSettings } from 'app/shared/utils/dialog-settings';
import { getRecommendationTypeName } from 'app/shared/utils/recommendation-type-names';
import { BaseComponent } from 'app/site/base/components/base.component';
import { ViewMotion } from 'app/site/motions/models/view-motion';
import { ViewMotionChangeRecommendation } from 'app/site/motions/models/view-motion-change-recommendation';
import { LineNumberingMode } from 'app/site/motions/motions.constants';
import {
    MotionChangeRecommendationDialogComponent,
    MotionChangeRecommendationDialogComponentData
} from '../motion-change-recommendation-dialog/motion-change-recommendation-dialog.component';
import {
    MotionTitleChangeRecommendationDialogComponent,
    MotionTitleChangeRecommendationDialogComponentData
} from '../motion-title-change-recommendation-dialog/motion-title-change-recommendation-dialog.component';

/**
 * This component displays the original motion text with the change blocks inside.
 * If the user is an administrator, each change block can be rejected.
 *
 * The line numbers are provided within the pre-rendered HTML, so we have to work with raw HTML
 * and native HTML elements.
 *
 * It takes the styling from the parent component.
 *
 * ## Examples
 *
 * ```html
 *  <os-motion-detail-diff
 *       [motion]="motion"
 *       [changes]="changes"
 *       [scrollToChange]="change"
 *       [highlightedLine]="highlightedLine"
 *       [lineNumberingMode]="lnMode"
 *       (createChangeRecommendation)="createChangeRecommendation($event)"
 * ></os-motion-detail-diff>
 * ```
 */
@Component({
    selector: 'os-motion-detail-diff',
    templateUrl: './motion-detail-diff.component.html',
    styleUrls: ['./motion-detail-diff.component.scss']
})
export class MotionDetailDiffComponent extends BaseComponent implements AfterViewInit {
    /**
     * Get the {@link getRecommendationTypeName}-Function from Utils
     */
    public getRecommendationTypeName = getRecommendationTypeName;

    @Input()
    public motion: ViewMotion;
    @Input()
    public changes: ViewUnifiedChange[];
    @Input()
    public scrollToChange: ViewUnifiedChange;
    @Input()
    public highlightedLine: number;
    @Input()
    public lineNumberingMode: LineNumberingMode;

    @Output()
    public createChangeRecommendation: EventEmitter<LineRange> = new EventEmitter<LineRange>();

    /**
     * Indicates the maximum line length as defined in the configuration.
     */
    public lineLength: number;

    public preamble: string;

    /**
     * @param title
     * @param translate
     * @param matSnackBar
     * @param diff
     * @param recoRepo
     * @param dialogService
     * @param organisationSettingsService
     * @param el
     * @param promptService
     */
    public constructor(
        componentServiceCollector: ComponentServiceCollector,
        private diff: DiffService,
        private recoRepo: ChangeRecommendationRepositoryService,
        private dialogService: MatDialog,
        private organisationSettingsService: OrganisationSettingsService,
        private el: ElementRef,
        private promptService: PromptService
    ) {
        super(componentServiceCollector);
        this.organisationSettingsService
            .get<number>('motions_line_length')
            .subscribe(lineLength => (this.lineLength = lineLength));
        this.organisationSettingsService
            .get<string>('motions_preamble')
            .subscribe(preamble => (this.preamble = preamble));
    }

    /**
     * Returns the part of this motion between two change objects
     * @param {ViewUnifiedChange} change1
     * @param {ViewUnifiedChange} change2
     */
    public getTextBetweenChanges(change1: ViewUnifiedChange, change2: ViewUnifiedChange): string {
        // @TODO Highlighting
        const lineRange: LineRange = {
            from: change1 ? change1.getLineTo() : 1,
            to: change2 ? change2.getLineFrom() : null
        };

        if (lineRange.from >= lineRange.to) {
            // Empty space between two amendments, or between colliding amendments
            return '';
        }

        return this.diff.extractMotionLineRange(
            this.motion.text,
            lineRange,
            true,
            this.lineLength,
            this.highlightedLine
        );
    }

    /**
     * Returns true if this change is colliding with another change
     * @param {ViewUnifiedChange} change
     * @param {ViewUnifiedChange[]} changes
     */
    public hasCollissions(change: ViewUnifiedChange, changes: ViewUnifiedChange[]): boolean {
        return (
            changes.filter((otherChange: ViewUnifiedChange) => {
                return (
                    otherChange.getChangeId() !== change.getChangeId() &&
                    ((otherChange.getLineFrom() >= change.getLineFrom() &&
                        otherChange.getLineFrom() < change.getLineTo()) ||
                        (otherChange.getLineTo() > change.getLineFrom() &&
                            otherChange.getLineTo() <= change.getLineTo()) ||
                        (otherChange.getLineFrom() < change.getLineFrom() &&
                            otherChange.getLineTo() > change.getLineTo()))
                );
            }).length > 0
        );
    }

    /**
     * Returns the diff string from the motion to the change
     * @param {ViewUnifiedChange} change
     */
    public getDiff(change: ViewUnifiedChange): string {
        return this.diff.getChangeDiff(this.motion.text, change, this.lineLength, this.highlightedLine);
    }

    /**
     * Returns the remainder text of the motion after the last change
     */
    public getTextRemainderAfterLastChange(): string {
        if (!this.lineLength) {
            return ''; // @TODO This happens in the test case when the lineLength-variable is not set
        }
        return this.diff.getTextRemainderAfterLastChange(
            this.motion.text,
            this.changes,
            this.lineLength,
            this.highlightedLine
        );
    }

    /**
     * If only one line is affected, the line number is returned; otherwise, a string like [line] "1 - 5"
     *
     * @param {ViewUnifiedChange} change
     * @returns string
     */
    public formatLineRange(change: ViewUnifiedChange): string {
        if (change.getLineFrom() < change.getLineTo() - 1) {
            return change.getLineFrom().toString(10) + ' - ' + (change.getLineTo() - 1).toString(10);
        } else {
            return change.getLineFrom().toString(10);
        }
    }

    /**
     * Returns true if the change is a Change Recommendation
     *
     * @param {ViewUnifiedChange} change
     */
    public isRecommendation(change: ViewUnifiedChange): boolean {
        return change.getChangeType() === ViewUnifiedChangeType.TYPE_CHANGE_RECOMMENDATION;
    }

    /**
     * Returns true if no line numbers are to be shown.
     *
     * @returns whether there are line numbers at all
     */
    public isLineNumberingNone(): boolean {
        return this.lineNumberingMode === LineNumberingMode.None;
    }

    /**
     * Returns true if the line numbers are to be shown within the text with no line breaks.
     *
     * @returns whether the line numberings are inside
     */
    public isLineNumberingInline(): boolean {
        return this.lineNumberingMode === LineNumberingMode.Inside;
    }

    /**
     * Returns true if the line numbers are to be shown to the left of the text.
     *
     * @returns whether the line numberings are outside
     */
    public isLineNumberingOutside(): boolean {
        return this.lineNumberingMode === LineNumberingMode.Outside;
    }

    /**
     * Returns true if the change is an Amendment
     *
     * @param {ViewUnifiedChange} change
     */
    public isAmendment(change: ViewUnifiedChange): boolean {
        return change.getChangeType() === ViewUnifiedChangeType.TYPE_AMENDMENT;
    }

    /**
     * Returns true if the change is a Change Recommendation
     *
     * @param {ViewUnifiedChange} change
     */
    public isChangeRecommendation(change: ViewUnifiedChange): boolean {
        return change.getChangeType() === ViewUnifiedChangeType.TYPE_CHANGE_RECOMMENDATION;
    }

    public getAllTextChangingObjects(): ViewUnifiedChange[] {
        return this.changes.filter((obj: ViewUnifiedChange) => !obj.isTitleChange());
    }

    public getTitleChangingObject(): ViewUnifiedChange {
        return this.changes.find((obj: ViewUnifiedChange) => obj.isTitleChange());
    }

    public getFormattedTitleDiff(): string {
        const change = this.getTitleChangingObject();
        return this.recoRepo.getTitleChangesAsDiff(this.motion.title, change);
    }

    /**
     * Sets a change recommendation to accepted or rejected.
     * The template has to make sure only to pass change recommendations to this method.
     *
     * @param {ViewMotionChangeRecommendation} change
     * @param {string} value
     */
    public async setAcceptanceValue(change: ViewMotionChangeRecommendation, value: string): Promise<void> {
        try {
            if (value === 'accepted') {
                await this.recoRepo.setAccepted(change);
            }
            if (value === 'rejected') {
                await this.recoRepo.setRejected(change);
            }
        } catch (e) {
            this.raiseError(e);
        }
    }

    /**
     * Sets if a change recommendation is internal or not
     *
     * @param {ViewMotionChangeRecommendation} change
     * @param {boolean} internal
     */
    public setInternal(change: ViewMotionChangeRecommendation, internal: boolean): void {
        this.recoRepo.setInternal(change, internal).catch(this.raiseError);
    }

    /**
     * Deletes a change recommendation.
     * The template has to make sure only to pass change recommendations to this method.
     *
     * @param {ViewMotionChangeRecommendation} reco
     * @param {MouseEvent} $event
     */
    public async deleteChangeRecommendation(reco: ViewMotionChangeRecommendation, $event: MouseEvent): Promise<void> {
        $event.stopPropagation();
        $event.preventDefault();
        const title = this.translate.instant('Are you sure you want to delete this change recommendation?');
        if (await this.promptService.open(title)) {
            this.recoRepo.delete(reco).catch(this.raiseError);
        }
    }

    /**
     * Edits a change recommendation.
     * The template has to make sure only to pass change recommendations to this method.
     *
     * @param {ViewMotionChangeRecommendation} reco
     * @param {MouseEvent} $event
     */
    public editChangeRecommendation(reco: ViewMotionChangeRecommendation, $event: MouseEvent): void {
        $event.stopPropagation();
        $event.preventDefault();

        const data: MotionChangeRecommendationDialogComponentData = {
            editChangeRecommendation: true,
            newChangeRecommendation: false,
            lineRange: {
                from: reco.getLineFrom(),
                to: reco.getLineTo()
            },
            changeRecommendation: reco
        };
        this.dialogService.open(MotionChangeRecommendationDialogComponent, {
            ...mediumDialogSettings,
            data: data
        });
    }

    public editTitleChangeRecommendation(reco: ViewMotionChangeRecommendation, $event: MouseEvent): void {
        $event.stopPropagation();
        $event.preventDefault();

        const data: MotionTitleChangeRecommendationDialogComponentData = {
            editChangeRecommendation: true,
            newChangeRecommendation: false,
            changeRecommendation: reco
        };
        this.dialogService.open(MotionTitleChangeRecommendationDialogComponent, {
            ...mediumDialogSettings,
            data: data
        });
    }

    /**
     * Scrolls to the native element specified by [scrollToChange]
     */
    private scrollToChangeElement(change: ViewUnifiedChange): void {
        const element = <HTMLElement>this.el.nativeElement;
        const target = element.querySelector('[data-change-id="' + change.getChangeId() + '"]');
        target.scrollIntoView({ behavior: 'smooth' });
    }

    public scrollToChangeClicked(change: ViewUnifiedChange, $event: MouseEvent): void {
        $event.preventDefault();
        $event.stopPropagation();
        this.scrollToChangeElement(change);
    }

    /**
     * Called from motion-detail-original-change-recommendations -> delegate to parent
     *
     * @param {LineRange} event
     */
    public onCreateChangeRecommendation(event: LineRange): void {
        this.createChangeRecommendation.emit(event);
    }

    public ngAfterViewInit(): void {
        if (this.scrollToChange) {
            window.setTimeout(() => {
                this.scrollToChangeElement(this.scrollToChange);
            }, 50);
        }
    }
}
